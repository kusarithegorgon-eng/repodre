/**
 * useEdgeSnap — Dynamic Edge-Snapping Path Engine
 *
 * A React hook that monitors node positions and recomputes smooth cubic-bezier
 * SVG paths between explicit anchor ports on every render. Edges snap exactly
 * to the left/right boundary ports of each node, so wires never clip into
 * node geometry — even while a node is being dragged.
 *
 * The hook is pure and side-effect free: it derives routed paths from the
 * current node/edge state on each render. Because React re-renders during
 * drag (the parent updates node x/y via setPosition), the paths recalculate
 * automatically without a manual animation loop.
 */

import { useMemo, useCallback } from "react";
import {
  type PositionedNode,
  type HandleSegment,
  type Point,
  snappedEdgePath,
  boundaryPorts,
  portForHandle,
} from "@/lib/canvas-geometry";

export interface SnapNode extends PositionedNode {
  id: string;
}

export interface SnapEdge {
  id: string;
  from: string;
  to: string;
  fromHandle?: HandleSegment;
  toHandle?: HandleSegment;
}

export interface RoutedSnapEdge {
  id: string;
  path: string;
  start: Point;
  end: Point;
  /** true if either endpoint could not be resolved (orphaned edge) */
  orphaned: boolean;
}

export interface EdgeSnapResult {
  /** routed paths keyed by edge id */
  edges: Map<string, RoutedSnapEdge>;
  /** flat array for convenient .map() rendering */
  list: RoutedSnapEdge[];
}

/**
 * Recompute all edge paths from the current node positions.
 *
 * Call this inside a useMemo in your canvas component so paths stay in
 * sync with node drags automatically:
 *
 *   const { list } = useEdgeSnap(nodes, edges);
 *
 * @param nodes  - all canvas nodes (must include both endpoints of every edge)
 * @param edges  - all edges to route
 */
export function useEdgeSnap(
  nodes: SnapNode[],
  edges: SnapEdge[],
): EdgeSnapResult {
  const nodeById = useMemo(() => {
    const map = new Map<string, SnapNode>();
    for (const n of nodes) map.set(n.id, n);
    return map;
  }, [nodes]);

  const list = useMemo(() => {
    return edges.map((e) => {
      const from = nodeById.get(e.from);
      const to = nodeById.get(e.to);

      if (!from || !to) {
        return { id: e.id, path: "", start: { x: 0, y: 0 }, end: { x: 0, y: 0 }, orphaned: true };
      }

      const { path, start, end } = snappedEdgePath(from, to, e.fromHandle, e.toHandle);
      return { id: e.id, path, start, end, orphaned: false };
    });
  }, [edges, nodeById]);

  const edgesMap = useMemo(() => {
    const map = new Map<string, RoutedSnapEdge>();
    for (const r of list) map.set(r.id, r);
    return map;
  }, [list]);

  return { edges: edgesMap, list };
}

/**
 * Resolve the left/right boundary ports for a single node.
 * Useful for rendering port indicators or hit-testing drag-to-connect.
 */
export function useBoundaryPorts(node: SnapNode | null) {
  return useMemo(() => {
    if (!node) return null;
    return boundaryPorts(node);
  }, [node]);
}

/**
 * Resolve a specific handle to an absolute port point.
 */
export function usePortForHandle(node: SnapNode | null, handle: HandleSegment | undefined) {
  return useMemo(() => {
    if (!node || !handle) return null;
    return portForHandle(node, handle);
  }, [node, handle]);
}

/**
 * Helper to build a live drag-preview path from a start port to the
 * current mouse position. Used by the drag-to-connect interaction.
 */
export function useLiveDragPath() {
  return useCallback(
    (start: Point, mouse: Point, curvature = 80): string => {
      const dx = mouse.x - start.x;
      const sign = dx >= 0 ? 1 : -1;
      const cp1x = start.x + sign * curvature;
      const cp2x = mouse.x - sign * curvature;
      return `M ${start.x} ${start.y} C ${cp1x} ${start.y}, ${cp2x} ${mouse.y}, ${mouse.x} ${mouse.y}`;
    },
    [],
  );
}
