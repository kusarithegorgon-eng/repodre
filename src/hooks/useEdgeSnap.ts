import { useMemo } from "react";
import { smoothstepBetweenNodes, snappedEdgePath, type NodeData, type EdgeData, type Point } from "@/lib/canvas-geometry";

export interface RoutedEdge {
  id: string;
  path: string;
  start: Point;
  end: Point;
  orphaned: boolean;
}

export interface EdgeSnapResult {
  list: RoutedEdge[];
  map: Map<string, RoutedEdge>;
}

export function useEdgeSnap(
  nodes: NodeData[],
  edges: EdgeData[],
  wireStyle: "curvy" | "straight" | "orthogonal" = "orthogonal",
): EdgeSnapResult {
  const nodeById = useMemo(() => {
    const m = new Map<string, NodeData>();
    for (const n of nodes) m.set(n.id, n);
    return m;
  }, [nodes]);

  const list = useMemo(() => {
    return edges.map((e) => {
      const from = nodeById.get(e.from);
      const to = nodeById.get(e.to);
      if (!from || !to) {
        return { id: e.id, path: "", start: { x: 0, y: 0 }, end: { x: 0, y: 0 }, orphaned: true };
      }
      if (wireStyle === "orthogonal") {
        const path = smoothstepBetweenNodes(from, to);
        const { start, end } = snappedEdgePath(from, to, e.fromHandle, e.toHandle);
        return { id: e.id, path: path ?? "", start, end, orphaned: false };
      }
      const { path, start, end } = snappedEdgePath(from, to, e.fromHandle, e.toHandle);
      return { id: e.id, path, start, end, orphaned: false };
    });
  }, [edges, nodeById, wireStyle]);

  const map = useMemo(() => {
    const m = new Map<string, RoutedEdge>();
    for (const r of list) m.set(r.id, r);
    return m;
  }, [list]);

  return { list, map };
}
