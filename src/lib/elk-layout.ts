import ELK from "elkjs/lib/elk-api.js";

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
