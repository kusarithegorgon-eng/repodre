import ELK from "elkjs";
import type { NodeData, EdgeData } from "./canvas-geometry";

const elk = new ELK();

export type LayoutDensity = "compact" | "comfortable" | "spacious";

const DENSITY_SPACING: Record<LayoutDensity, { nodeNode: number; layer: number }> = {
  compact: { nodeNode: 60, layer: 160 },
  comfortable: { nodeNode: 100, layer: 220 },
  spacious: { nodeNode: 140, layer: 300 },
};

export interface SmartLayoutOptions {
  density?: LayoutDensity;
  direction?: "DOWN" | "RIGHT";
  lockedIds?: Set<string>;
}

export interface SmartLayoutResult {
  positions: Map<string, { x: number; y: number }>;
}

export async function runSmartLayout(
  nodes: NodeData[],
  edges: EdgeData[],
  options: SmartLayoutOptions = {},
): Promise<SmartLayoutResult> {
  const density = options.density ?? "comfortable";
  const direction = options.direction ?? "DOWN";
  const lockedIds = options.lockedIds ?? new Set<string>();
  const spacing = DENSITY_SPACING[density];

  const positions = new Map<string, { x: number; y: number }>();

  for (const n of nodes) {
    if (lockedIds.has(n.id)) {
      positions.set(n.id, { x: n.x, y: n.y });
    }
  }

  const toLayout = nodes.filter((n) => !lockedIds.has(n.id));
  if (toLayout.length === 0) return { positions };

  const elkNodes = toLayout.map((n) => ({
    id: n.id,
    width: n.w ?? 240,
    height: n.h ?? 100,
  }));

  const elkEdges = edges
    .filter((e) => e.from !== e.to)
    .map((e, i) => ({
      id: e.id || `e${i}`,
      sources: [e.from],
      targets: [e.to],
    }));

  const elkGraph = {
    id: "root",
    children: elkNodes,
    edges: elkEdges,
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": direction,
      "elk.layered.spacing.nodeNodeBetweenLayers": `${spacing.layer}`,
      "elk.spacing.nodeNode": `${spacing.nodeNode}`,
      "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
      "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
      "elk.edgeRouting": "ORTHOGONAL",
    } as Record<string, string>,
  };

  try {
    const layout = await elk.layout(elkGraph);
    for (const n of layout.children ?? []) {
      positions.set(n.id, { x: (n.x ?? 0) + 120, y: (n.y ?? 0) + 100 });
    }
  } catch (err) {
    console.error("runSmartLayout failed, using fallback:", err);
    toLayout.forEach((n, i) => {
      positions.set(n.id, { x: 120 + (i % 4) * 300, y: 100 + Math.floor(i / 4) * 200 });
    });
  }

  return { positions };
}
