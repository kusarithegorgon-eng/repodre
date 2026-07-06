/**
 * Swimlane Layout Engine
 *
 * Arranges journey nodes into functional group columns ("swimlanes"),
 * matching the cross-functional flowchart pattern (Customer | Sales | Contracts…).
 *
 * Lane assignment is derived from each node's `swimlane` property:
 *   entry     → col 0  "Entry & Exit"
 *   auth      → col 1  "Auth & Middleware"
 *   logic     → col 2  "Core Logic"
 *   services  → col 3  "Background Services"
 *   data      → col 4  "Data Layer"
 *   errors    → col 5  "Error Handling"
 *
 * Within each lane nodes are stacked vertically. Edges that cross lanes
 * draw horizontally first then drop vertically — the caller renders them
 * as orthogonal paths.
 */

import type { JourneyGraph, JourneyNode, SwimlaneLane } from "./journey-flow-builder";
import { NODE_W, NODE_H } from "./canvas-geometry";

// ─── Lane definitions ─────────────────────────────────────────────────────

export interface LaneDef {
  id: SwimlaneLane;
  label: string;
  index: number;
  /** Tailwind / CSS accent color token for the header */
  color: string;
  headerBg: string;
}

export const LANE_DEFS: LaneDef[] = [
  { id: "entry",    label: "Entry & Exit",          index: 0, color: "#16a34a", headerBg: "rgba(22,163,74,0.12)" },
  { id: "auth",     label: "Auth & Middleware",      index: 1, color: "#ea580c", headerBg: "rgba(234,88,12,0.10)" },
  { id: "logic",    label: "Core Logic",             index: 2, color: "#0d9488", headerBg: "rgba(13,148,136,0.10)" },
  { id: "services", label: "Background Services",    index: 3, color: "#7c3aed", headerBg: "rgba(124,58,237,0.10)" },
  { id: "data",     label: "Data Layer",             index: 4, color: "#2563eb", headerBg: "rgba(37,99,235,0.10)" },
  { id: "errors",   label: "Error Handling",         index: 5, color: "#dc2626", headerBg: "rgba(220,38,38,0.10)" },
];

export const LANE_INDEX: Record<SwimlaneLane, number> = Object.fromEntries(
  LANE_DEFS.map((l) => [l.id, l.index])
) as Record<SwimlaneLane, number>;

// ─── Layout constants ─────────────────────────────────────────────────────

const LANE_PADDING_X = 40;   // space between node edge and lane boundary
const NODE_GAP_Y     = 60;   // vertical gap between nodes in the same lane
const HEADER_HEIGHT  = 72;   // swimlane header bar height
const START_Y        = HEADER_HEIGHT + 60; // first node top position

export const LANE_WIDTH  = NODE_W + LANE_PADDING_X * 2;   // 260px default
export const LANE_COLUMN_X = (laneIndex: number) =>
  laneIndex * LANE_WIDTH;
export const NODE_CENTER_X = (laneIndex: number) =>
  LANE_COLUMN_X(laneIndex) + LANE_WIDTH / 2 - NODE_W / 2;

export interface SwimlaneLayout {
  /** Map of nodeId → computed {x, y, depth} position */
  positions: Map<string, { x: number; y: number; depth: number }>;
  /** Lane metadata for rendering headers and background bands */
  lanes: Array<LaneDef & { x: number; width: number; populated: boolean }>;
  /** Total canvas width */
  totalWidth: number;
  /** Total canvas height */
  totalHeight: number;
}

/**
 * Compute swimlane positions for all nodes in a JourneyGraph.
 *
 * Nodes without a swimlane fall back to the "logic" lane.
 * Bridge nodes are excluded — they're only meaningful in the tree layout.
 */
export function layoutJourneySwimlanes(graph: JourneyGraph): SwimlaneLayout {
  const positions = new Map<string, { x: number; y: number; depth: number }>();

  // Group nodes by lane (skip bridge nodes — not meaningful in swimlane view)
  const laneNodes = new Map<SwimlaneLane, JourneyNode[]>();
  for (const def of LANE_DEFS) laneNodes.set(def.id, []);

  for (const node of graph.nodes) {
    if (node.type === "bridge") continue;
    const lane = node.swimlane ?? "logic";
    laneNodes.get(lane)!.push(node);
  }

  // Sort nodes within each lane by their original `row` order so the
  // sequence within a lane is preserved.
  for (const nodes of laneNodes.values()) {
    nodes.sort((a, b) => a.row - b.row || a.col - b.col);
  }

  // Assign y positions within each lane (stacked vertically)
  let maxY = START_Y;
  for (const [lane, nodes] of laneNodes) {
    const laneIdx = LANE_INDEX[lane];
    const x = NODE_CENTER_X(laneIdx);
    nodes.forEach((node, i) => {
      const y = START_Y + i * (NODE_H + NODE_GAP_Y);
      const depth = i;
      positions.set(node.id, { x, y, depth });
      if (y + NODE_H > maxY) maxY = y + NODE_H;
    });
  }

  // Determine which lanes are populated
  const populatedLanes = new Set(
    [...laneNodes.entries()].filter(([, nodes]) => nodes.length > 0).map(([lane]) => lane)
  );

  const lanes = LANE_DEFS.map((def) => ({
    ...def,
    x: LANE_COLUMN_X(def.index),
    width: LANE_WIDTH,
    populated: populatedLanes.has(def.id),
  }));

  const totalWidth = LANE_DEFS.length * LANE_WIDTH;
  const totalHeight = maxY + 80;

  return { positions, lanes, totalWidth, totalHeight };
}
