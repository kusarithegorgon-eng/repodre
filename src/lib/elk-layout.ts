/**
 * ELK Layout Engine for Journey Graph
 *
 * Provides a professional "Family Tree" layout using the Eclipse Layout Kernel (ELK).
 * Uses the `layered` algorithm with DOWN direction for top-to-bottom hierarchies.
 *
 * Key features:
 * - Treats decision nodes as branching points
 * - Configurable spacing (nodeNode, nodeEdge, edgeEdge) to prevent zigzag
 * - Async API compatible with the existing repository analyzer
 */

import ELK from "elkjs/lib/elk.bundled.js";
import type { JourneyGraph, JourneyNode, JourneyEdge, JourneyNodeType } from "./journey-flow-builder";
import { layoutJourneyTree } from "./journey-flow-builder";

export interface ElkLayoutOptions {
  /** Layout direction: DOWN (top-to-bottom) or RIGHT (left-to-right) */
  direction: "DOWN" | "RIGHT";
  /** Horizontal spacing between nodes (in DOWN direction, this is sibling spacing) */
  nodeNodeSpacing: number;
  /** Spacing between nodes and edges */
  nodeEdgeSpacing: number;
  /** Spacing between edges */
  edgeEdgeSpacing: number;
  /** Vertical spacing between layers (ranks) */
  layerSpacing: number;
  /** Extra spacing for children of decision nodes */
  decisionSpacing: number;
  /** Extra spacing around Bridge nodes (soft barriers between sections) */
  bridgeSpacing: number;
  /** Starting x offset */
  startX: number;
  /** Starting y offset */
  startY: number;
}

const DEFAULT_ELK_OPTIONS: ElkLayoutOptions = {
  direction: "DOWN",
  nodeNodeSpacing: 100,
  nodeEdgeSpacing: 50,
  edgeEdgeSpacing: 25,
  layerSpacing: 340,
  decisionSpacing: 140,
  bridgeSpacing: 240,
  startX: 120,
  startY: 100,
};

// ELK node shape constants
const NODE_WIDTH = 180;
const NODE_HEIGHT = 80;
// Bridge nodes are smaller circles
const BRIDGE_NODE_SIZE = 72;

const elk = new ELK();

/**
 * Layout a JourneyGraph using ELK's layered algorithm.
 *
 * @param graph - The journey graph to layout
 * @param options - Layout configuration options
 * @returns Map of node IDs to their computed positions {x, y, depth}
 */
export async function layoutJourneyGraphWithElk(
  graph: JourneyGraph,
  options: Partial<ElkLayoutOptions> = {}
): Promise<Map<string, { x: number; y: number; depth: number }>> {
  const opts = { ...DEFAULT_ELK_OPTIONS, ...options };
  const positions = new Map<string, { x: number; y: number; depth: number }>();

  if (graph.nodes.length === 0) return positions;

  // Build node type lookup for decision-aware spacing
  const nodeTypeMap = new Map<string, JourneyNodeType>();
  const parentNode = new Map<string, string>();
  for (const n of graph.nodes) nodeTypeMap.set(n.id, n.type);

  // Build parent -> children adjacency (for detecting decision node children)
  const children = new Map<string, string[]>();
  for (const n of graph.nodes) children.set(n.id, []);

  // Filter convergence edges (same logic as the original layoutJourneyTree)
  const CONVERGENCE_LABELS = new Set([
    "select", "call external", "enqueue", "catch error",
    "check cache", "cache miss", "log",
    "save project", "save post", "save comment", "save file", "save order",
    "save data", "store profile", "update record",
  ]);
  const isTreeEdge = (label: string | undefined): boolean => {
    if (!label) return true;
    if (CONVERGENCE_LABELS.has(label)) return false;
    if (/^(CREATE|READ|UPDATE|DELETE)\s*→/.test(label)) return false;
    return true;
  };

  for (const edge of graph.edges) {
    if (edge.from === edge.to) continue;
    if (!isTreeEdge(edge.label)) continue;
    const kids = children.get(edge.from);
    if (kids && !kids.includes(edge.to)) {
      kids.push(edge.to);
      parentNode.set(edge.to, edge.from);
    }
  }

  // Build ELK graph structure
  // Node ID mapping: use journey node IDs directly
  const elkNodes = graph.nodes.map((node) => {
    const isDecision = node.type === "decision";
    const isBridge = node.type === "bridge";
    const parentIsDecision = parentNode.has(node.id) &&
      nodeTypeMap.get(parentNode.get(node.id)!) === "decision";
    const parentIsBridge = parentNode.has(node.id) &&
      nodeTypeMap.get(parentNode.get(node.id)!) === "bridge";

    // Apply decision spacing for children of decision nodes
    // Apply extra bridge spacing for children of bridge nodes (soft barrier)
    let nodeSpacing = opts.nodeNodeSpacing;
    if (parentIsDecision) nodeSpacing += opts.decisionSpacing;
    if (parentIsBridge || isBridge) nodeSpacing += opts.bridgeSpacing;

    // Bridge nodes are smaller circles
    const width = isBridge ? BRIDGE_NODE_SIZE : NODE_WIDTH;
    const height = isBridge ? BRIDGE_NODE_SIZE : NODE_HEIGHT;

    const layoutOptions: Record<string, string> = {};
    if (parentIsDecision || parentIsBridge || isBridge) {
      layoutOptions["elk.spacing.nodeNode"] = `${nodeSpacing}`;
    }
    if (isBridge) {
      // Extra layer spacing so the bridge creates a visible "chapter break"
      layoutOptions["elk.layered.spacing.nodeNodeBetweenLayers"] = `${opts.layerSpacing + opts.bridgeSpacing}`;
    }

    return {
      id: node.id,
      width,
      height,
      layoutOptions: Object.keys(layoutOptions).length > 0 ? layoutOptions : undefined,
    };
  });

  // Build ELK edges (using identifiers, not section references)
  const elkEdges = graph.edges
    .filter((edge) => isTreeEdge(edge.label) && edge.from !== edge.to)
    .map((edge, index) => ({
      id: edge.id || `e${index}`,
      sources: [edge.from],
      targets: [edge.to],
    }));

  // Construct the root graph for ELK
  const elkGraph = {
    id: "root",
    children: elkNodes,
    edges: elkEdges,
    layoutOptions: {
      // Core algorithm: layered for hierarchical/trees
      "elk.algorithm": "layered",
      // Direction: DOWN for top-to-bottom tree
      "elk.direction": opts.direction,
      // Layer spacing (vertical gap between ranks)
      "elk.layered.spacing.nodeNodeBetweenLayers": `${opts.layerSpacing}`,
      // Node spacing within layers (horizontal gap)
      "elk.spacing.nodeNode": `${opts.nodeNodeSpacing}`,
      // Edge spacing
      "elk.spacing.edgeEdge": `${opts.edgeEdgeSpacing}`,
      "elk.spacing.nodeEdge": `${opts.nodeEdgeSpacing}`,
      // Node placement strategy for clean branching
      "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
      // Cross-minimization to reduce zigzag
      "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
      "elk.layered.crossingMinimization.semiInteractive": "true",
      // Cycle breaking for DAGs with back-edges
      "elk.layered.cycleBreaking.strategy": "GREEDY",
      // Layering strategy for consistent tree depth
      "elk.layered.layering.strategy": "NETWORK_SIMPLEX",
      // Content-based node size
      "elk.layered.nodePlacement.favorStraightEdges": "true",
      // Edge routing: orthogonal for clean right-angle paths
      "elk.edgeRouting": "ORTHOGONAL",
      // Edge bundling: merge parallel edges that follow the same path
      "elk.layered.mergeEdges": "true",
      // Thoroughness for crossing minimization (higher = better but slower)
      "elk.layered.thoroughness": "8",
      // Additional spacing for decision nodes
      "elk.layered.spacing.edgeNodeBetweenLayers": `${opts.nodeEdgeSpacing}`,
      // Port constraints to ensure clean edge anchors
      "elk.portConstraints": "FIXED_ORDER",
      // Edge label placement to avoid overlaps
      "elk.layered.edgeLabels.insideSwitch": "true",
      // Straight edge routing preference
      "elk.layered.edgeStraightening": "IMPROVE_STRAIGHTNESS",
    } as Record<string, string>,
  };

  try {
    // Run the ELK layout algorithm
    const layout = await elk.layout(elkGraph);

    // Extract positions from ELK's output
    // ELK returns nodes with computed x, y positions
    const laidOutNodes = layout.children || [];

    for (const elkNode of laidOutNodes) {
      const idx = graph.nodes.findIndex((n) => n.id === elkNode.id);
      if (idx === -1) continue;

      // Calculate depth from y position
      const rawX = elkNode.x ?? 0;
      const rawY = elkNode.y ?? 0;

      // Apply offset to shift the layout
      const x = rawX + opts.startX;
      const y = rawY + opts.startY;

      // Calculate depth from y position
      const depth = Math.round(rawY / opts.layerSpacing);

      positions.set(elkNode.id, { x, y, depth });
    }

    // Handle any nodes that weren't positioned by ELK (orphans)
    const unpositioned = graph.nodes.filter((n) => !positions.has(n.id));
    if (unpositioned.length > 0) {
      // Place unpositioned nodes in a column to the right
      const maxDepth = Math.max(...[...positions.values()].map((p) => p.depth), 0);
      const maxX = Math.max(...[...positions.values()].map((p) => p.x), 0);

      unpositioned.forEach((node, i) => {
        positions.set(node.id, {
          x: maxX + opts.nodeNodeSpacing * 2 + opts.startX,
          y: opts.startY + (maxDepth + i + 1) * opts.layerSpacing,
          depth: maxDepth + i + 1,
        });
      });
    }

    return positions;
  } catch (error) {
    console.error("ELK layout failed, falling back to sync tree layout:", error);

    // Fallback: use the synchronous tree layout (no web worker, no GWT)
    const fallbackPositions = layoutJourneyTree(graph, {
      nodeSep: opts.nodeNodeSpacing,
      rankSep: opts.layerSpacing,
      decisionNodeSep: opts.decisionSpacing,
      bridgeRankSep: opts.bridgeSpacing,
      startX: opts.startX,
      startY: opts.startY,
    });

    for (const [id, pos] of fallbackPositions.entries()) {
      positions.set(id, pos);
    }

    return positions;
  }
}

/**
 * Re-export the async layout function with a sync-friendly name
 * for potential use in environments where async isn't required.
 */
export { layoutJourneyGraphWithElk as layoutJourneyTreeAsync };
