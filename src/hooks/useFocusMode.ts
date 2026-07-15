import { useMemo } from "react";
import type { EdgeData } from "@/lib/canvas-geometry";

export interface FocusModeResult {
  getNodeOpacity: (nodeId: string) => number;
  getEdgeOpacity: (edgeId: string) => number;
}

const FULL = 1;
const DIM = 0.15;

export function useFocusMode(
  selected: string | null,
  edges: EdgeData[],
): FocusModeResult {
  const connected = useMemo(() => {
    if (!selected) return null;
    const set = new Set<string>([selected]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const e of edges) {
        if (set.has(e.from) && !set.has(e.to)) { set.add(e.to); changed = true; }
        else if (set.has(e.to) && !set.has(e.from)) { set.add(e.from); changed = true; }
      }
    }
    return set;
  }, [selected, edges]);

  const edgeSet = useMemo(() => {
    if (!connected) return null;
    const s = new Set<string>();
    for (const e of edges) {
      if (connected.has(e.from) && connected.has(e.to)) s.add(e.id);
    }
    return s;
  }, [connected, edges]);

  return {
    getNodeOpacity: (nodeId: string) => connected ? (connected.has(nodeId) ? FULL : DIM) : FULL,
    getEdgeOpacity: (edgeId: string) => edgeSet ? (edgeSet.has(edgeId) ? FULL : DIM) : FULL,
  };
}
