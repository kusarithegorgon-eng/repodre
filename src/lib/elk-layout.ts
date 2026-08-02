import ELK from "elkjs/lib/elk.bundled.js";

const elk = new ELK();

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

  const positions = new Map<string, { x: number; y: number }>();

  if (graph.nodes.length === 0) return positions;

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
    const result = await elk.layout(elkGraph as any);
    for (const child of result.children || []) {
      positions.set(child.id, { x: (child.x ?? 0) + startX, y: (child.y ?? 0) + startY });
    }
  } catch {
    // Fallback: simple grid layout
    const COLS = 4;
    graph.nodes.forEach((n, i) => {
      positions.set(n.id, {
        x: startX + (i % COLS) * 280,
        y: startY + Math.floor(i / COLS) * 160,
      });
    });
  }

  return positions;
}

export async function layoutGraph(
  nodes: GraphNode[],
  edges: GraphEdge[]
): Promise<LayoutResult> {
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

  const result = await elk.layout(graph as any);

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
}
