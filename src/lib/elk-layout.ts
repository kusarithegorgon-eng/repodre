import type { JourneyGraph, JourneyNode, JourneyEdge, JourneyNodeType } from "./journey-flow-builder";

export interface LayoutNode {
  id: string;
  width: number;
  height: number;
  x: number;
  y: number;
}

export interface LayoutEdge {
  id: string;
  sources: string[];
  targets: string[];
  sections: { startPoint: { x: number; y: number }; endPoint: { x: number; y: number }[] }[];
}

export interface LayoutResult {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
}

export interface GraphNode {
  id: string;
  label: string;
  type: "dir" | "file";
  path: string;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
}

const NODE_W = 170;
const NODE_H = 38;

// ─── Lazy ELK initialization ──────────────────────────────────────────────
// ELK is loaded lazily so a worker-creation failure never crashes the entire
// module at import time (which would take down the whole app chunk). If the
// worker can't be created, we fall back to a synchronous main-thread ELK.

let elkInstance: any | null = null;
let elkInitFailed = false;

async function getElk(): Promise<any> {
  if (elkInstance) return elkInstance;
  if (elkInitFailed) return null;

  try {
    const ELK = (await import("elkjs/lib/elk-api.js")).default;
    const elkWorkerUrl = (await import("elkjs/lib/elk-worker.min.js?url")).default;

    if (elkWorkerUrl) {
      elkInstance = new ELK({ workerUrl: elkWorkerUrl });
    } else {
      // No worker URL resolved — use the bundled version that runs on main thread
      const BundledELK = (await import("elkjs/lib/elk.bundled.js")).default;
      elkInstance = new BundledELK();
    }
    return elkInstance;
  } catch (err) {
    console.warn("ELK initialization failed, will use grid fallback:", err);
    elkInitFailed = true;
    return null;
  }
}

// ─── Journey Graph Layout (ELK layered) ─────────────────────────────────────

export interface JourneyLayoutOptions {
  direction?: "DOWN" | "RIGHT";
  nodeNodeSpacing?: number;
  nodeEdgeSpacing?: number;
  edgeEdgeSpacing?: number;
  layerSpacing?: number;
  decisionSpacing?: number;
  startX?: number;
  startY?: number;
}

function gridFallback(
  nodes: Array<{ id: string }>,
  startX: number,
  startY: number
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const COLS = 4;
  nodes.forEach((n, i) => {
    positions.set(n.id, {
      x: startX + (i % COLS) * 280,
      y: startY + Math.floor(i / COLS) * 160,
    });
  });
  return positions;
}

export async function layoutJourneyGraphWithElk(
  graph: { nodes: Array<{ id: string; type?: string; label?: string; shape?: string }>; edges: Array<{ id: string; from: string; to: string; label?: string }> },
  options: JourneyLayoutOptions = {}
): Promise<Map<string, { x: number; y: number }>> {
  const {
    direction = "DOWN",
    nodeNodeSpacing = 40,
    layerSpacing = 80,
    startX = 120,
    startY = 100,
  } = options;

  if (graph.nodes.length === 0) return new Map();

  const elk = await getElk();
  if (!elk) return gridFallback(graph.nodes, startX, startY);

  const elkNodes = graph.nodes.map((n) => ({
    id: n.id,
    width: 200,
    height: 60,
  }));

  const elkEdges = graph.edges.map((e) => ({
    id: e.id,
    sources: [e.from],
    targets: [e.to],
  }));

  const elkGraph = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": direction,
      "elk.layered.spacing.nodeNodeBetweenLayers": String(layerSpacing),
      "elk.spacing.nodeNode": String(nodeNodeSpacing),
      "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
      "elk.layered.nodePlacement.bk.fixedAlignment": "BALANCED",
    },
    children: elkNodes,
    edges: elkEdges,
  };

  try {
    const result = await elk.layout(elkGraph);
    const positions = new Map<string, { x: number; y: number }>();
    for (const child of result.children || []) {
      positions.set(child.id, { x: (child.x ?? 0) + startX, y: (child.y ?? 0) + startY });
    }
    return positions;
  } catch (err) {
    console.warn("ELK layout failed, using grid fallback:", err);
    return gridFallback(graph.nodes, startX, startY);
  }
}

export async function layoutGraph(
  nodes: GraphNode[],
  edges: GraphEdge[]
): Promise<LayoutResult> {
  const elk = await getElk();

  if (!elk) {
    const positions = gridFallback(nodes, 120, 100);
    return {
      nodes: nodes.map((n) => {
        const pos = positions.get(n.id) ?? { x: 0, y: 0 };
        return { id: n.id, width: NODE_W, height: NODE_H, x: pos.x, y: pos.y };
      }),
      edges: edges.map((e) => ({
        id: e.id,
        sources: [e.source],
        targets: [e.target],
        sections: [],
      })),
    };
  }

  const elkNodes = nodes.map((n) => ({
    id: n.id,
    width: NODE_W,
    height: NODE_H,
    layoutOptions: { "elk.portConstraints": "FIXED" },
  }));

  const portSide = { side: "EAST" };
  const elkEdges = edges.map((e) => ({
    id: e.id,
    sources: [`${e.source}:p`],
    targets: [`${e.target}:p`],
  }));

  const elkPorts = nodes.map((n) => ({
    id: `${n.id}:p`,
    width: 0,
    height: 0,
    ...portSide,
  }));

  const graph = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "DOWN",
      "elk.layered.spacing.nodeNodeBetweenLayers": "55",
      "elk.spacing.nodeNode": "30",
      "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
      "elk.layered.nodePlacement.bk.fixedAlignment": "BALANCED",
      "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
    },
    children: elkNodes.map((n, i) => ({ ...n, ports: [elkPorts[i]] })),
    edges: elkEdges,
  };

  try {
    const result = await elk.layout(graph);

    const layoutNodes: LayoutNode[] = (result.children || []).map((c: any) => ({
      id: c.id,
      width: c.width,
      height: c.height,
      x: c.x,
      y: c.y,
    }));

    const layoutEdges: LayoutEdge[] = (result.edges || []).map((e: any) => ({
      id: e.id,
      sources: e.sources,
      targets: e.targets,
      sections: (e.sections || []).map((s: any) => ({
        startPoint: s.startPoint,
        endPoint: s.bendPoints ? [...s.bendPoints, s.endPoint] : [s.endPoint],
      })),
    }));

    return { nodes: layoutNodes, edges: layoutEdges };
  } catch (err) {
    console.warn("ELK layoutGraph failed, using grid fallback:", err);
    const positions = gridFallback(nodes, 120, 100);
    return {
      nodes: nodes.map((n) => {
        const pos = positions.get(n.id) ?? { x: 0, y: 0 };
        return { id: n.id, width: NODE_W, height: NODE_H, x: pos.x, y: pos.y };
      }),
      edges: edges.map((e) => ({
        id: e.id,
        sources: [e.source],
        targets: [e.target],
        sections: [],
      })),
    };
  }
}
