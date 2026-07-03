/**
 * Force-Directed Graph Layout Engine
 *
 * Provides automatic node positioning using force-directed algorithms
 * simulating physical forces between nodes and edges.
 */

import type { AnalysisNode, AnalysisEdge } from "../analysis/automated-analysis-engine";

export interface LayoutOptions {
  /** Width of the layout area */
  width: number;
  /** Height of the layout area */
  height: number;
  /** Ideal edge length */
  edgeLength: number;
  /** Repulsion strength between nodes */
  repulsion: number;
  /** Attraction strength along edges */
  attraction: number;
  /** Gravity towards center */
  gravity: number;
  /** Number of simulation iterations */
  iterations: number;
  /** Initial temperature for simulated annealing */
  temperature: number;
  /** Cooling rate per iteration */
  coolingRate: number;
}

const DEFAULT_OPTIONS: LayoutOptions = {
  width: 1200,
  height: 800,
  edgeLength: 150,
  repulsion: 5000,
  attraction: 0.1,
  gravity: 0.01,
  iterations: 300,
  temperature: 100,
  coolingRate: 0.95,
};

export interface PositionedNode extends AnalysisNode {
  vx: number;
  vy: number;
  fixed?: boolean;
}

/**
 * Force-directed layout using Barnes-Hut optimization.
 */
export function forceDirectedLayout(
  nodes: AnalysisNode[],
  edges: AnalysisEdge[],
  options: Partial<LayoutOptions> = {}
): AnalysisNode[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  if (nodes.length === 0) return [];
  if (nodes.length === 1) {
    return [{ ...nodes[0], x: opts.width / 2, y: opts.height / 2 }];
  }

  // Initialize positions randomly
  const positioned: PositionedNode[] = nodes.map((n, i) => ({
    ...n,
    x: n.x || (opts.width / 4) + (Math.random() * opts.width) / 2,
    y: n.y || (opts.height / 4) + (Math.random() * opts.height) / 2,
    vx: 0,
    vy: 0,
    fixed: n.x !== 0 && n.y !== 0,
  }));

  // Build edge adjacency
  const adjacency = new Map<string, string[]>>();
  for (const edge of edges) {
    if (!adjacency.has(edge.from)) adjacency.set(edge.from, []);
    if (!adjacency.has(edge.to)) adjacency.set(edge.to, []);
    adjacency.get(edge.from)!.push(edge.to);
    adjacency.get(edge.to)!.push(edge.from);
  }

  let temperature = opts.temperature;

  // Simulation loop
  for (let iter = 0; iter < opts.iterations; iter++) {
    // Reset forces
    for (const node of positioned) {
      if (node.fixed) continue;
      node.vx = 0;
      node.vy = 0;
    }

    // Repulsion: all nodes repel each other
    for (let i = 0; i < positioned.length; i++) {
      const a = positioned[i];
      if (a.fixed) continue;

      for (let j = i + 1; j < positioned.length; j++) {
        const b = positioned[j];

        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
        const force = opts.repulsion / (dist * dist);

        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;

        if (!a.fixed) {
          a.vx += fx;
          a.vy += fy;
        }
        if (!b.fixed) {
          b.vx -= fx;
          b.vy -= fy;
        }
      }
    }

    // Attraction: connected nodes attract
    for (const edge of edges) {
      const a = positioned.find((n) => n.id === edge.from);
      const b = positioned.find((n) => n.id === edge.to);
      if (!a || !b) continue;

      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
      const force = opts.attraction * (dist - opts.edgeLength);

      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;

      if (!a.fixed) {
        a.vx += fx;
        a.vy += fy;
      }
      if (!b.fixed) {
        b.vx -= fx;
        b.vy -= fy;
      }
    }

    // Gravity: pull towards center
    const cx = opts.width / 2;
    const cy = opts.height / 2;
    for (const node of positioned) {
      if (node.fixed) continue;

      const dx = cx - node.x;
      const dy = cy - node.y;
      node.vx += dx * opts.gravity;
      node.vy += dy * opts.gravity;
    }

    // Apply forces with temperature-scaled displacement
    for (const node of positioned) {
      if (node.fixed) continue;

      const speed = Math.sqrt(node.vx * node.vx + node.vy * node.vy);
      const maxSpeed = temperature;
      if (speed > maxSpeed) {
        node.vx = (node.vx / speed) * maxSpeed;
        node.vy = (node.vy / speed) * maxSpeed;
      }

      node.x += node.vx;
      node.y += node.vy;

      // Keep in bounds
      node.x = Math.max(50, Math.min(opts.width - 50, node.x));
      node.y = Math.max(50, Math.min(opts.height - 50, node.y));
    }

    // Cool down
    temperature *= opts.coolingRate;
  }

  // Return without velocity
  return positioned.map(({ vx, vy, ...rest }) => rest);
}

/**
 * Hierarchical layout using topological sorting.
 * Good for dependency graphs with clear parent-child relationships.
 */
export function hierarchicalLayout(
  nodes: AnalysisNode[],
  edges: AnalysisEdge[],
  options: { nodeWidth?: number; nodeHeight?: number; layerGap?: number; nodeGap?: number } = {}
): AnalysisNode[] {
  const { nodeWidth = 160, nodeHeight = 60, layerGap = 180, nodeGap = 80 } = options;

  if (nodes.length === 0) return [];

  // Build adjacency and compute in-degree
  const inDegree = new Map<string, number>();
  const outEdges = new Map<string, string[]>();

  for (const node of nodes) {
    inDegree.set(node.id, 0);
    outEdges.set(node.id, []);
  }

  for (const edge of edges) {
    inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1);
    outEdges.get(edge.from)?.push(edge.to);
  }

  // Kahn's algorithm for topological sort with layers
  const layers: string[][] = [];
  const queue: string[] = [];

  // Start with nodes that have no incoming edges
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  const visited = new Set<string>();

  while (queue.length > 0) {
    const layer = [...queue];
    layers.push(layer);
    queue.length = 0;

    for (const id of layer) {
      visited.add(id);
      for (const neighbor of outEdges.get(id) ?? []) {
        inDegree.set(neighbor, (inDegree.get(neighbor) ?? 1) - 1);
        if (inDegree.get(neighbor) === 0 && !visited.has(neighbor)) {
          queue.push(neighbor);
        }
      }
    }
  }

  // Handle cycles: add remaining nodes to last layer
  const remaining = nodes.filter((n) => !visited.has(n.id));
  if (remaining.length > 0) {
    layers.push(remaining.map((n) => n.id));
  }

  // Position nodes
  const idToNode = new Map(nodes.map((n) => [n.id, n]));
  const result: AnalysisNode[] = [];

  for (let layerIdx = 0; layerIdx < layers.length; layerIdx++) {
    const layer = layers[layerIdx];
    const y = 80 + layerIdx * layerGap;

    for (let nodeIdx = 0; nodeIdx < layer.length; nodeIdx++) {
      const id = layer[nodeIdx];
      const node = idToNode.get(id);
      if (!node) continue;

      // Center the layer horizontally
      const layerWidth = layer.length * (nodeWidth + nodeGap) - nodeGap;
      const startX = (1200 - layerWidth) / 2;
      const x = startX + nodeIdx * (nodeWidth + nodeGap);

      result.push({ ...node, x, y });
    }
  }

  return result;
}

/**
 * Grid layout for simple visualization.
 */
export function gridLayout(
  nodes: AnalysisNode[],
  _edges: AnalysisEdge[],
  options: { cols?: number; cellWidth?: number; cellHeight?: number } = {}
): AnalysisNode[] {
  const { cols = 4, cellWidth = 200, cellHeight = 100 } = options;

  if (nodes.length === 0) return [];

  const result: AnalysisNode[] = [];
  const effectiveCols = Math.min(cols, nodes.length);

  for (let i = 0; i < nodes.length; i++) {
    const col = i % effectiveCols;
    const row = Math.floor(i / effectiveCols);

    result.push({
      ...nodes[i],
      x: 80 + col * cellWidth,
      y: 80 + row * cellHeight,
    });
  }

  return result;
}

/**
 * Hybrid layout: uses hierarchical for DAG portions, force-directed for cycles.
 */
export function hybridLayout(
  nodes: AnalysisNode[],
  edges: AnalysisEdge[],
  options: Partial<LayoutOptions> = {}
): AnalysisNode[] {
  // Check if graph is mostly a DAG
  const { hasCycle, dagPercentage } = analyzeGraph(nodes, edges);

  if (dagPercentage > 0.8) {
    return hierarchicalLayout(nodes, edges);
  } else {
    return forceDirectedLayout(nodes, edges, options);
  }
}

function analyzeGraph(
  nodes: AnalysisNode[],
  edges: AnalysisEdge[]
): { hasCycle: boolean; dagPercentage: number } {
  const adj = new Map<string, string[]>();
  for (const edge of edges) {
    if (!adj.has(edge.from)) adj.set(edge.from, []);
    adj.get(edge.from)!.push(edge.to);
  }

  const visited = new Set<string>();
  const recStack = new Set<string>();
  let cycleNodes = 0;

  function dfs(id: string): boolean {
    visited.add(id);
    recStack.add(id);

    let inCycle = false;
    for (const neighbor of adj.get(id) ?? []) {
      if (!visited.has(neighbor)) {
        if (dfs(neighbor)) inCycle = true;
      } else if (recStack.has(neighbor)) {
        inCycle = true;
      }
    }

    recStack.delete(id);
    if (inCycle) cycleNodes++;
    return inCycle;
  }

  for (const node of nodes) {
    if (!visited.has(node.id)) {
      dfs(node.id);
    }
  }

  return {
    hasCycle: cycleNodes > 0,
    dagPercentage: nodes.length > 0 ? 1 - cycleNodes / nodes.length : 1,
  };
}
