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
 * Lay out a blueprint as a left-to-right user-journey timeline.
 *
 * Strategy:
 *   1. Group nodes by semantic column (view, validation, controller, db, error).
 *   2. Within each column, order nodes by their connectivity — nodes that
 *      participate in the same journey (share an edge) are placed on the
 *      same row so connectors stay short and horizontal.
 *   3. Assign (x, y) coordinates from the column/row grid.
 */
export function layoutBlueprint(blueprint: Blueprint): LaidOutBlueprint {
  const { nodes, edges } = blueprint;

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
    if (parent.get(x) === x) return x;
    const root = find(parent.get(x) ?? x);
    parent.set(x, root);
    return root;
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
