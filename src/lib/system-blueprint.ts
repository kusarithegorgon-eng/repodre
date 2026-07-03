/**
 * System Blueprint Layout Engine
 *
 * Positions the BlueprintNode/BlueprintEdge graph produced by
 * blueprint-analyzer.ts into a left-to-right user-journey timeline:
 *
 *   [View Route] ──> [Validation] ──> [API Controller] ──> [Database Table]
 *                                          │
 *                                          └──> [Error] (off the main spine)
 *
 * Also supports Domain-Driven Sectioning:
 *   - Groups routes into visual canvas regions based on directory prefixes
 *   - Adds Role Gateway Switches for post-login routing
 *   - Creates Portal Links for cross-section navigation
 *
 * Each node is assigned a "column" based on its semantic type, and a "row"
 * within that column. Columns are spaced horizontally; rows are stacked
 * vertically with a gap. The output is a flat list of positioned nodes
 * (compatible with the canvas-geometry PositionedNode shape) plus edges
 * keyed by node id, ready to feed into the StudioPage canvas and the
 * db-client persistence layer.
 */

import { NODE_W, NODE_H, type HandleSegment, type PositionedNode, type Shape } from "./canvas-geometry";
import type {
  Blueprint,
  BlueprintAccent,
  BlueprintNode,
  BlueprintEdge,
} from "./blueprint-analyzer";
import type { EnhancedBlueprint, EnhancedBlueprintEdge, NodeMetadata } from "./enhanced-analyzer";
import type {
  CanvasSection,
  RoleGateway,
  PortalLink,
  SectionedBlueprint,
} from "./domain-sectioning";

export interface PositionedBlueprintNode extends PositionedNode {
  id: string;
  label: string;
  sub: string;
  shape: Shape;
  accent: BlueprintAccent;
  type: BlueprintNode["type"];
  /** Style hints for dynamic routes */
  styleHints?: {
    borderStyle: "solid" | "dashed" | "dotted";
    borderDashArray: string;
    opacity: number;
    showParamBadge: boolean;
    paramBadgeText: string;
  };
  /** Whether this node has fuzzy route references */
  hasFuzzyReferences?: boolean;
}

export interface PositionedBlueprintEdge {
  id: string;
  from: string;
  to: string;
  fromHandle?: HandleSegment;
  toHandle?: HandleSegment;
  label?: string;
  /** Whether this is a route reference edge */
  isRouteReference?: boolean;
  /** Detection method for route references */
  referenceType?: "explicit" | "fuzzy" | "inferred";
  /** Opacity for rendering */
  renderOpacity?: number;
  /** SVG stroke-dasharray for edge styling */
  strokeDasharray?: string;
}

export interface LaidOutBlueprint {
  nodes: PositionedBlueprintNode[];
  edges: PositionedBlueprintEdge[];
}

// ─── Sectioned Layout Types ──────────────────────────────────────────────────────

export interface PositionedSection extends CanvasSection {
  bounds: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
}

export interface PositionedRoleGateway extends RoleGateway {
  x: number;
  y: number;
}

export interface PositionedPortalLink extends PortalLink {
  portalPoint: { x: number; y: number };
}

export interface SectionedLayout extends LaidOutBlueprint {
  sections: PositionedSection[];
  roleGateways: PositionedRoleGateway[];
  portalLinks: PositionedPortalLink[];
  edgesToReplace: string[];
}

// ─── Layout constants ──────────────────────────────────────────────────────

const COLUMN_WIDTH = NODE_W + 140; // horizontal gap between columns
const ROW_HEIGHT = NODE_H + 80; // vertical gap between rows
const START_X = 80;
const START_Y = 80;

// Column order: left-to-right user journey timeline
const COLUMN_ORDER: BlueprintNode["type"][] = [
  "view",
  "validation",
  "controller",
  "database",
  "error",
];

function columnFor(type: BlueprintNode["type"]): number {
  const idx = COLUMN_ORDER.indexOf(type);
  return idx === -1 ? COLUMN_ORDER.length : idx;
}

/**
 * Grid layout fallback for single-type node graphs.
 * Distributes nodes in a horizontal-first grid pattern.
 */
function layoutAsGrid(blueprint: Blueprint): LaidOutBlueprint {
  const { nodes, edges } = blueprint;

  // Sort nodes by label for stable ordering
  const sortedNodes = [...nodes].sort((a, b) => a.label.localeCompare(b.label));

  // Compute grid dimensions: aim for roughly square aspect ratio
  const cols = Math.ceil(Math.sqrt(sortedNodes.length));
  const rowsAlloc = Math.ceil(sortedNodes.length / cols);

  const GRID_COL_WIDTH = NODE_W + 100;
  const GRID_ROW_HEIGHT = NODE_H + 60;

  const positionedNodes: PositionedBlueprintNode[] = sortedNodes.map((n, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    return {
      id: n.id,
      label: n.label,
      sub: n.sub,
      shape: n.shape,
      accent: n.accent,
      type: n.type,
      x: START_X + col * GRID_COL_WIDTH,
      y: START_Y + row * GRID_ROW_HEIGHT,
    };
  });

  // For edges, use auto-routing based on relative positions
  const positionedEdges: PositionedBlueprintEdge[] = edges.map((e) => {
    const fromNode = positionedNodes.find((n) => n.id === e.from);
    const toNode = positionedNodes.find((n) => n.id === e.to);
    let fromHandle: HandleSegment | undefined;
    let toHandle: HandleSegment | undefined;

    if (fromNode && toNode) {
      const dx = toNode.x - fromNode.x;
      const dy = toNode.y - fromNode.y;

      if (Math.abs(dx) > Math.abs(dy)) {
        // Horizontal connection
        fromHandle = dx > 0 ? "e" : "w";
        toHandle = dx > 0 ? "w" : "e";
      } else {
        // Vertical connection
        fromHandle = dy > 0 ? "s" : "n";
        toHandle = dy > 0 ? "n" : "s";
      }
    }

    return {
      id: e.id,
      from: e.from,
      to: e.to,
      fromHandle,
      toHandle,
      label: e.label,
    };
  });

  return { nodes: positionedNodes, edges: positionedEdges };
}

/**
 * Lay out a blueprint as a left-to-right user-journey timeline.
 *
 * Strategy:
 *   1. Group nodes by semantic column (view, validation, controller, db, error).
 *   2. Within each column, order nodes by their connectivity — nodes that
 *      participate in the same journey (share an edge) are placed on the
 *      same row so connectors stay short and horizontal.
 *   3. Assign (x, y) coordinates from the column/row grid.
 *   4. FALLBACK: When all nodes fall into a single column (e.g., only database
 *      tables detected), apply a grid layout instead of vertical stacking.
 */
export function layoutBlueprint(blueprint: Blueprint): LaidOutBlueprint {
  const { nodes, edges } = blueprint;

  // ── 0. Grid fallback for single-type node graphs ───────────────────────────
  const uniqueColumns = new Set(nodes.map((n) => columnFor(n.type)));
  if (uniqueColumns.size === 1 && nodes.length > 1) {
    return layoutAsGrid(blueprint);
  }

  // ── 1. Assign each node to a column ──────────────────────────────────
  const byColumn = new Map<number, BlueprintNode[]>();
  for (const n of nodes) {
    const col = columnFor(n.type);
    if (!byColumn.has(col)) byColumn.set(col, []);
    byColumn.get(col)!.push(n);
  }

  // ── 2. Build an adjacency index for row alignment ───────────────────
  // We want nodes connected by an edge to share a row when possible.
  // Use a union-find over the "journey line" so a View → Validation →
  // Controller → Database chain collapses onto a single row.
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    const visited = new Set<string>();
    let cur = x;
    while (parent.get(cur) !== cur) {
      if (visited.has(cur)) {
        // cycle detected — break it by rooting at the current node
        parent.set(cur, cur);
        return cur;
      }
      visited.add(cur);
      const next = parent.get(cur);
      if (next === undefined) {
        parent.set(cur, cur);
        return cur;
      }
      cur = next;
    }
    // path compression
    for (const v of visited) parent.set(v, cur);
    return cur;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  for (const n of nodes) parent.set(n.id, n.id);
  for (const e of edges) {
    if (e.label === "Failure") continue; // error branches don't align rows
    union(e.from, e.to);
  }

  // ── 3. Assign rows: each connected component gets one row index ──────
  // Components are sorted by their leftmost node's label for stable output.
  const componentRows = new Map<string, number>();
  const components = new Map<string, BlueprintNode[]>();
  for (const n of nodes) {
    const root = find(n.id);
    if (!components.has(root)) components.set(root, []);
    components.get(root)!.push(n);
  }

  // Sort components by the minimum column they occupy, then by label
  const sortedComponents = Array.from(components.values()).sort((a, b) => {
    const colA = Math.min(...a.map((n) => columnFor(n.type)));
    const colB = Math.min(...b.map((n) => columnFor(n.type)));
    if (colA !== colB) return colA - colB;
    const labelA = a.map((n) => n.label).sort()[0];
    const labelB = b.map((n) => n.label).sort()[0];
    return labelA.localeCompare(labelB);
  });

  // Track how many rows each column has used, so disconnected nodes in the
  // same column stack below the connected ones.
  const rowsPerColumn = new Map<number, number>();
  for (const col of COLUMN_ORDER.keys()) rowsPerColumn.set(col, 0);

  const rowOfNode = new Map<string, number>();

  // First pass: assign rows to nodes that belong to a connected component
  // with more than one member (i.e. on the main journey spine).
  for (const comp of sortedComponents) {
    if (comp.length < 2) continue;
    // pick a row that's free across ALL columns this component spans
    const cols = comp.map((n) => columnFor(n.type));
    const minCol = Math.min(...cols);
    const row = rowsPerColumn.get(minCol)!;
    // bump the row counter for every column this component touches
    for (const col of new Set(cols)) {
      rowsPerColumn.set(col, Math.max(rowsPerColumn.get(col) ?? 0, row + 1));
    }
    for (const n of comp) rowOfNode.set(n.id, row);
  }

  // Second pass: place remaining (isolated) nodes in the next free row of
  // their own column.
  for (const n of nodes) {
    if (rowOfNode.has(n.id)) continue;
    const col = columnFor(n.type);
    const row = rowsPerColumn.get(col) ?? 0;
    rowOfNode.set(n.id, row);
    rowsPerColumn.set(col, row + 1);
  }

  // ── 4. Compute (x, y) from column + row ───────────────────────────────
  const positionedNodes: PositionedBlueprintNode[] = nodes.map((n) => {
    const col = columnFor(n.type);
    const row = rowOfNode.get(n.id) ?? 0;
    return {
      id: n.id,
      label: n.label,
      sub: n.sub,
      shape: n.shape,
      accent: n.accent,
      type: n.type,
      x: START_X + col * COLUMN_WIDTH,
      y: START_Y + row * ROW_HEIGHT,
    };
  });

  // ── 5. Map edges to positioned edges, attaching sensible handles ─────
  // For left-to-right flow: out-going from the right ("e") handle of the
  // source, into the left ("w") handle of the target. Error branches go
  // down from the validation's "s" handle.
  const positionedEdges: PositionedBlueprintEdge[] = edges.map((e) => {
    const fromNode = nodes.find((n) => n.id === e.from);
    const toNode = nodes.find((n) => n.id === e.to);
    let fromHandle: HandleSegment | undefined;
    let toHandle: HandleSegment | undefined;

    if (fromNode && toNode) {
      if (e.label === "Failure") {
        // Validation → Error: drop down
        fromHandle = "s";
        toHandle = "n";
      } else {
        const fromCol = columnFor(fromNode.type);
        const toCol = columnFor(toNode.type);
        if (toCol > fromCol) {
          fromHandle = "e";
          toHandle = "w";
        } else if (toCol < fromCol) {
          fromHandle = "w";
          toHandle = "e";
        } else {
          // same column: vertical
          fromHandle = "s";
          toHandle = "n";
        }
      }
    }

    return {
      id: e.id,
      from: e.from,
      to: e.to,
      fromHandle,
      toHandle,
      label: e.label,
    };
  });

  return { nodes: positionedNodes, edges: positionedEdges };
}

/**
 * Layout an enhanced blueprint with style hints for dynamic routes.
 */
export function layoutEnhancedBlueprint(
  blueprint: EnhancedBlueprint
): LaidOutBlueprint {
  // First do base layout
  const baseLayout = layoutBlueprint({
    nodes: blueprint.nodes,
    edges: blueprint.edges,
    stats: blueprint.stats,
  });

  // ── Apply style hints from node metadata ───────────────────────────────────
  const enhancedNodes: PositionedBlueprintNode[] = baseLayout.nodes.map((node) => {
    const meta = blueprint.nodeMetadata.get(node.id);

    if (meta?.isDynamicRoute && meta.routeParams) {
      // Find the normalized route for this node
      const normalizedRoute = blueprint.normalizedRoutes.find(
        (r) => r.normalizedPath === node.label || r.originalPath?.includes(node.label)
      );

      if (normalizedRoute) {
        return {
          ...node,
          styleHints: {
            borderStyle: normalizedRoute.styleHints.borderStyle,
            borderDashArray: normalizedRoute.styleHints.borderDashArray,
            opacity: normalizedRoute.styleHints.opacity,
            showParamBadge: normalizedRoute.styleHints.showParamBadge,
            paramBadgeText: normalizedRoute.styleHints.paramBadgeText,
          },
        };
      }
    }

    return node;
  });

  // ── Apply route reference edge styles ───────────────────────────────────────
  const enhancedEdges: PositionedBlueprintEdge[] = baseLayout.edges.map((edge) => {
    // Find the matching enhanced edge
    const enhancedEdge = blueprint.edges.find((e) => e.id === edge.id) as EnhancedBlueprintEdge | undefined;

    if (enhancedEdge?.isRouteReference) {
      return {
        ...edge,
        isRouteReference: true,
        referenceType: enhancedEdge.referenceType,
        renderOpacity: enhancedEdge.renderOpacity,
        strokeDasharray:
          enhancedEdge.referenceType === "inferred"
            ? "4 4"
            : enhancedEdge.referenceType === "fuzzy"
            ? "2 4"
            : undefined,
        label: enhancedEdge.isManualReference ? "ref?" : edge.label,
      };
    }

    return edge;
  });

  return { nodes: enhancedNodes, edges: enhancedEdges };
}

// ─── Section-Aware Layout Constants ────────────────────────────────────────────

const SECTION_PADDING = 60;
const SECTION_HEADER_HEIGHT = 40;
const SECTION_MIN_WIDTH = 400;
const SECTION_MIN_HEIGHT = 300;

// ─── Sectioned Layout Engine ─────────────────────────────────────────────────────

/**
 * Layout a sectioned blueprint with domain-driven grouping.
 *
 * Strategy:
 *   1. First lay out nodes using base timeline layout
 *   2. Group nodes by their section assignments
 *   3. Compute bounding boxes for each section
 *   4. Position role gateways after auth controllers
 *   5. Create portal links for cross-section edges
 */
export function layoutSectionedBlueprint(
  blueprint: SectionedBlueprint,
  baseLayout?: LaidOutBlueprint
): SectionedLayout {
  // Get base layout if not provided
  const layout = baseLayout ?? layoutBlueprint({
    nodes: blueprint.nodes,
    edges: blueprint.edges,
    stats: { routes: 0, validations: 0, controllers: 0, databases: 0 },
  });

  // ── 1. Position sections based on their nodes ───────────────────────────
  const positionedSections: PositionedSection[] = [];
  const nodePositions = new Map<string, { x: number; y: number }>();
  for (const node of layout.nodes) {
    nodePositions.set(node.id, { x: node.x, y: node.y });
  }

  for (const section of blueprint.sections) {
    const sectionNodePositions = section.nodeIds
      .map((id) => nodePositions.get(id))
      .filter((p): p is { x: number; y: number } => p !== undefined);

    if (sectionNodePositions.length === 0) continue;

    // Compute bounding box
    const minX = Math.min(...sectionNodePositions.map((p) => p.x));
    const minY = Math.min(...sectionNodePositions.map((p) => p.y));
    const maxX = Math.max(...sectionNodePositions.map((p) => p.x + NODE_W));
    const maxY = Math.max(...sectionNodePositions.map((p) => p.y + NODE_H));

    positionedSections.push({
      ...section,
      bounds: {
        x: minX - SECTION_PADDING,
        y: minY - SECTION_PADDING - SECTION_HEADER_HEIGHT,
        w: Math.max(SECTION_MIN_WIDTH, maxX - minX + SECTION_PADDING * 2),
        h: Math.max(SECTION_MIN_HEIGHT, maxY - minY + SECTION_PADDING * 2 + SECTION_HEADER_HEIGHT),
      },
    });
  }

  // ── 2. Position role gateways ────────────────────────────────────────────
  const positionedGateways: PositionedRoleGateway[] = [];

  for (const gateway of blueprint.roleGateways) {
    // Find the auth controller this gateway follows
    const authNode = layout.nodes.find(
      (n) => n.label === gateway.authControllerKey || n.id === gateway.authControllerKey
    );

    if (authNode) {
      // Position gateway to the right of the auth controller
      positionedGateways.push({
        ...gateway,
        x: authNode.x + COLUMN_WIDTH,
        y: authNode.y,
      });
    } else {
      // Fallback: position at start
      positionedGateways.push({
        ...gateway,
        x: START_X + COLUMN_WIDTH * 2,
        y: START_Y,
      });
    }
  }

  // ── 3. Position portal links ────────────────────────────────────────────
  const positionedPortals: PositionedPortalLink[] = [];

  for (const portal of blueprint.portalLinks) {
    const fromNodePos = nodePositions.get(portal.fromNodeId);
    if (!fromNodePos) continue;

    // Position portal at the edge of the source section
    const sourceSection = positionedSections.find((s) => s.id === portal.fromSectionId);
    const targetSection = positionedSections.find((s) => s.id === portal.toSectionId);

    if (!sourceSection || !targetSection) continue;

    // Determine portal endpoint based on target section position
    let portalX: number;
    let portalY: number;

    if (targetSection.bounds.x > sourceSection.bounds.x) {
      // Target is to the right - portal goes to right edge of source section
      portalX = sourceSection.bounds.x + sourceSection.bounds.w - 20;
      portalY = fromNodePos.y + NODE_H / 2;
    } else if (targetSection.bounds.x < sourceSection.bounds.x) {
      // Target is to the left - portal goes to left edge of source section
      portalX = sourceSection.bounds.x + 20;
      portalY = fromNodePos.y + NODE_H / 2;
    } else {
      // Target is above or below
      if (targetSection.bounds.y < sourceSection.bounds.y) {
        // Target is above
        portalX = fromNodePos.x + NODE_W / 2;
        portalY = sourceSection.bounds.y + 20;
      } else {
        // Target is below
        portalX = fromNodePos.x + NODE_W / 2;
        portalY = sourceSection.bounds.y + sourceSection.bounds.h - 20;
      }
    }

    positionedPortals.push({
      ...portal,
      portalPoint: { x: portalX, y: portalY },
    });
  }

  return {
    nodes: layout.nodes,
    edges: layout.edges,
    sections: positionedSections,
    roleGateways: positionedGateways,
    portalLinks: positionedPortals,
    edgesToReplace: blueprint.edgesToPortals,
  };
}

/**
 * Filter edges to remove those replaced by portal links.
 */
export function filterPortalEdges(
  edges: PositionedBlueprintEdge[],
  edgesToReplace: string[]
): PositionedBlueprintEdge[] {
  return edges.filter((e) => !edgesToReplace.includes(e.id));
}
