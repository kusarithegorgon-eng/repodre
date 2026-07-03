/**
 * Enhanced Blueprint Analyzer
 *
 * Integrates five structural engines into the blueprint analysis pipeline:
 *
 * 1. COMPONENT RECURSIVE DEPENDENCY RESOLVER
 *    - Traverses import chains from page.tsx files
 *    - Builds consolidated source context for deep analysis
 *
 * 2. ROUTE PARAMETER NORMALIZATION ENGINE
 *    - Processes [id], [slug], [...param] dynamic routes
 *    - Provides dashed border style hints for dynamic routes
 *
 * 3. FUZZY ACCELERATED ROUTE MATCHER
 *    - Scans for explicit route.push/Link references
 *    - Falls back to fuzzy regex sweep for string literals
 *    - Creates low-opacity reference wires for inferred routes
 *
 * 4. ROLE GATEWAY DETECTION
 *    - Detects post-login auth sequences
 *    - Creates switch nodes for role-based routing
 *
 * 5. DOMAIN SECTIONING
 *    - Groups routes by directory prefix namespaces
 *    - Creates section bounding boxes with dashed borders
 *    - Generates portal links for cross-section navigation
 */

import type { ParsedModule } from "./ast-parser";
import type { Shape } from "./canvas-geometry";
import {
  analyzeBlueprint,
  type Blueprint,
  type BlueprintNode,
  type BlueprintEdge,
  type BlueprintAccent,
  type BlueprintNodeType,
} from "./blueprint-analyzer";
import {
  resolveComponentDependencies,
  buildConsolidatedSource,
  type ResolvedComponent,
} from "./component-resolver";
import {
  normalizeRoutePath,
  normalizeRoutes,
  type NormalizedRoute,
} from "./route-normalizer";
import {
  analyzeRouteReferences,
  filterHighConfidenceEdges,
  type RouteReferenceEdge,
} from "./route-matcher";
import {
  applySectioning,
  type SectionedBlueprint,
  type CanvasSection,
  type RoleGateway,
  type PortalLink,
} from "./domain-sectioning";

/**
 * Enhanced blueprint with all structural data.
 */
export interface EnhancedBlueprint extends Blueprint {
  /** Normalized routes with dynamic parameter info */
  normalizedRoutes: NormalizedRoute[];
  /** Route reference edges from fuzzy matching */
  routeReferenceEdges: RouteReferenceEdge[];
  /** Component dependency trees for pages */
  componentDependencies: Map<string, ResolvedComponent>;
  /** Enhanced node metadata */
  nodeMetadata: Map<string, NodeMetadata>;
  /** Domain sections for visual grouping */
  sections: CanvasSection[];
  /** Role gateway switches for post-login routing */
  roleGateways: RoleGateway[];
  /** Portal links for cross-section navigation */
  portalLinks: PortalLink[];
  /** Edge IDs that should be replaced by portal links */
  edgesToPortals: string[];
}

/**
 * Additional metadata for blueprint nodes.
 */
export interface NodeMetadata {
  /** Whether this is a dynamic route */
  isDynamicRoute?: boolean;
  /** Route parameters if dynamic */
  routeParams?: NormalizedRoute["params"];
  /** SVG stroke-dasharray for dynamic routes */
  strokeDashArray?: string;
  /** Opacity for the node (lower for inferred connections) */
  opacity?: number;
  /** Import depth from the root page */
  importDepth?: number;
  /** Consolidated source for deep analysis */
  consolidatedSource?: string;
}

/**
 * Extended blueprint node with enhanced metadata.
 */
export interface EnhancedBlueprintNode extends BlueprintNode {
  /** Style hints from route normalization */
  styleHints?: {
    borderStyle: "solid" | "dashed" | "dotted";
    borderDashArray: string;
    opacity: number;
  };
  /** Whether this node has fuzzy route references */
  hasFuzzyReferences?: boolean;
  /** Import depth for component nodes */
  componentDepth?: number;
}

/**
 * Extended blueprint edge with reference info.
 */
export interface EnhancedBlueprintEdge extends BlueprintEdge {
  /** Whether this is a route reference edge */
  isRouteReference?: boolean;
  /** Detection method for route references */
  referenceType?: "explicit" | "fuzzy" | "inferred";
  /** Opacity for rendering (lower for fuzzy matches) */
  renderOpacity?: number;
  /** Whether this is a manual reference (needs user verification) */
  isManualReference?: boolean;
}

/**
 * Runs the full enhanced analysis pipeline.
 *
 * @param modules - Parsed source modules
 * @param fileContents - Raw file contents for dependency resolution
 * @param filePaths - All file paths for import resolution
 */
export function analyzeBlueprintEnhanced(
  modules: ParsedModule[],
  fileContents: Map<string, string> = new Map(),
  filePaths: string[] = []
): EnhancedBlueprint {
  // Run base blueprint analysis
  const baseBlueprint = analyzeBlueprint(modules);

  // Get all parsed modules as a map
  const parsedModulesMap = new Map<string, ParsedModule>();
  for (const mod of modules) {
    parsedModulesMap.set(mod.path, mod);
  }

  // ── 1. Normalize all routes with dynamic parameter detection ────────────
  const routePaths = modules
    .filter((m) => {
      const p = m.path;
      // Match both "/app/" (nested) and "app/" (root-level) paths
      const isAppRouter = (p.includes("/app/") || p.startsWith("app/")) && p.endsWith("page.tsx");
      const isPagesRouter = (p.includes("/pages/") || p.startsWith("pages/")) && /\.(tsx|jsx)$/.test(p);
      return isAppRouter || isPagesRouter;
    })
    .map((m) => m.path);

  const normalizedRoutes = normalizeRoutes(routePaths, "app-router");

  // ── 2. Resolve component dependencies for pages ──────────────────────────
  const componentDependencies = new Map<string, ResolvedComponent>();

  for (const routePath of routePaths) {
    if (fileContents.has(routePath)) {
      const resolved = resolveComponentDependencies(
        routePath,
        fileContents,
        parsedModulesMap,
        { maxDepth: 4 }
      );
      componentDependencies.set(routePath, resolved);
    }
  }

  // ── 3. Analyze route references ───────────────────────────────────────────
  const routeRefEdges = analyzeRouteReferences(modules, normalizedRoutes);
  const filteredRefEdges = filterHighConfidenceEdges(routeRefEdges, 0.3);

  // ── 4. Build enhanced nodes with style hints ─────────────────────────────
  const nodeMetadata = new Map<string, NodeMetadata>();

  for (const node of baseBlueprint.nodes) {
    if (node.type !== "view") continue;

    // Find matching normalized route
    const normalized = normalizedRoutes.find(
      (r) => r.normalizedPath === node.key || r.originalPath === node.sourcePath
    );

    if (normalized) {
      nodeMetadata.set(node.id, {
        isDynamicRoute: normalized.isDynamic,
        routeParams: normalized.params,
        strokeDashArray: normalized.styleHints.borderDashArray,
        opacity: normalized.styleHints.opacity,
      });

      // Add consolidated source if available
      const deps = componentDependencies.get(normalized.originalPath);
      if (deps) {
        nodeMetadata.set(node.id, {
          ...nodeMetadata.get(node.id)!,
          importDepth: deps.depth,
          consolidatedSource: buildConsolidatedSource(deps),
        });
      }
    }
  }

  // ── 5. Convert route reference edges to blueprint edges ──────────────────
  const enhancedEdges: EnhancedBlueprintEdge[] = [...baseBlueprint.edges];
  const nodeByKey = new Map<string, BlueprintNode>();
  for (const node of baseBlueprint.nodes) {
    nodeByKey.set(node.key, node);
  }

  // Add route reference edges
  for (const refEdge of filteredRefEdges) {
    const fromNode = baseBlueprint.nodes.find((n) => n.key === refEdge.fromRouteKey);
    const toNode = baseBlueprint.nodes.find((n) => n.key === refEdge.toRouteKey);

    if (fromNode && toNode) {
      enhancedEdges.push({
        id: `ref_${refEdge.id}`,
        from: fromNode.id,
        to: toNode.id,
        label: refEdge.isManualReference ? "ref?" : undefined,
        isRouteReference: true,
        referenceType: refEdge.detectionType,
        renderOpacity: refEdge.renderOpacity,
        isManualReference: refEdge.isManualReference,
      });
    }
  }

  // ── 6. Apply domain sectioning ─────────────────────────────────────────
  const sectioned = applySectioning(baseBlueprint, normalizedRoutes);

  return {
    ...baseBlueprint,
    edges: enhancedEdges,
    normalizedRoutes,
    routeReferenceEdges: filteredRefEdges,
    componentDependencies,
    nodeMetadata,
    sections: sectioned.sections,
    roleGateways: sectioned.roleGateways,
    portalLinks: sectioned.portalLinks,
    edgesToPortals: sectioned.edgesToPortals,
    stats: {
      ...baseBlueprint.stats,
    },
  };
}

/**
 * Gets the stroke-dasharray for a node based on route type.
 */
export function getNodeStrokeDashArray(
  node: BlueprintNode,
  metadata: Map<string, NodeMetadata>
): string {
  const meta = metadata.get(node.id);
  return meta?.strokeDashArray ?? "none";
}

/**
 * Gets the opacity for a node.
 */
export function getNodeOpacity(
  node: BlueprintNode,
  metadata: Map<string, NodeMetadata>
): number {
  const meta = metadata.get(node.id);
  return meta?.opacity ?? 1;
}

/**
 * Gets the opacity for an edge.
 */
export function getEdgeOpacity(edge: EnhancedBlueprintEdge): number {
  if (edge.isRouteReference) {
    return edge.renderOpacity ?? 0.4;
  }
  return 1;
}

/**
 * Checks if a node represents a dynamic route.
 */
export function isDynamicRouteNode(
  node: BlueprintNode,
  metadata: Map<string, NodeMetadata>
): boolean {
  const meta = metadata.get(node.id);
  return meta?.isDynamicRoute ?? false;
}

/**
 * Generates SVG style attributes for a node.
 */
export function getNodeSvgStyles(
  node: BlueprintNode,
  metadata: Map<string, NodeMetadata>
): {
  strokeDasharray: string;
  opacity: number;
  filter?: string;
} {
  const dashArray = getNodeStrokeDashArray(node, metadata);
  const opacity = getNodeOpacity(node, metadata);

  return {
    strokeDasharray: dashArray,
    opacity,
    filter: dashArray !== "none" ? "none" : undefined,
  };
}

/**
 * Generates SVG style attributes for an edge.
 */
export function getEdgeSvgStyles(edge: EnhancedBlueprintEdge): {
  strokeDasharray: string;
  strokeOpacity: number;
  strokeWidth: number;
} {
  if (edge.isRouteReference) {
    return {
      strokeDasharray: edge.referenceType === "inferred" ? "4 4" : "2 4",
      strokeOpacity: edge.renderOpacity ?? 0.4,
      strokeWidth: edge.referenceType === "explicit" ? 2 : 1.5,
    };
  }

  return {
    strokeDasharray: "none",
    strokeOpacity: 0.55,
    strokeWidth: 2,
  };
}
