export type Shape = "rectangle" | "pill" | "diamond" | "cylinder" | "hexagon" | "parallelogram" | "document" | "triangle";
export type Accent = "green" | "purple" | "teal" | "blue" | "orange" | "red";
export type Workspace = "app" | "erd";
export type HandleSegment = "n" | "e" | "s" | "w" | "ne" | "se" | "sw" | "nw";

export const NODE_W = 240;
export const NODE_H = 100;
export const CYLINDER_CAP = 16;

export interface Box { x: number; y: number; w: number; h: number; }
export interface Point { x: number; y: number; }

export interface PositionedNode {
  id: string;
  x: number;
  y: number;
  w?: number;
  h?: number;
  shape?: Shape;
}

export interface ColumnDef {
  name: string;
  type: string;
  isPK?: boolean;
  isFK?: boolean;
  nullable?: boolean;
  references?: string;
}

export interface NodeData {
  id: string;
  label: string;
  sub: string;
  shape: Shape;
  accent: Accent;
  x: number;
  y: number;
  w?: number;
  h?: number;
  workspace: Workspace;
  tableName?: string;
  columns?: ColumnDef[];
  isLocked?: boolean;
}

export interface EdgeData {
  id: string;
  from: string;
  to: string;
  fromHandle?: HandleSegment;
  toHandle?: HandleSegment;
  cardinality?: string;
  fromColumn?: string;
  toColumn?: string;
}

export function halfExtents(shape: Shape, w = NODE_W, h = NODE_H) {
  if (shape === "cylinder") return { hw: w / 2, hh: (h - CYLINDER_CAP) / 2 };
  return { hw: w / 2, hh: h / 2 };
}

export function centerOf(n: PositionedNode): Point {
  return { x: n.x + (n.w ?? NODE_W) / 2, y: n.y + (n.h ?? NODE_H) / 2 };
}

export function boundingBox(n: PositionedNode): Box {
  return { x: n.x, y: n.y, w: n.w ?? NODE_W, h: n.h ?? NODE_H };
}

export function perimeterPoint(n: PositionedNode, tx: number, ty: number): Point {
  const c = centerOf(n);
  const hw = (n.w ?? NODE_W) / 2;
  const hh = (n.h ?? NODE_H) / 2;
  const dx = tx - c.x;
  const dy = ty - c.y;
  if (dx === 0 && dy === 0) return c;
  const sx = hw / Math.abs(dx);
  const sy = hh / Math.abs(dy);
  const s = Math.min(sx, sy);
  return { x: c.x + dx * s, y: c.y + dy * s };
}

export function anchorBetween(from: PositionedNode, to: PositionedNode): Point {
  const tc = centerOf(to);
  return perimeterPoint(from, tc.x, tc.y);
}

export function anchorHandles(n: PositionedNode): { segment: HandleSegment; point: Point }[] {
  const w = n.w ?? NODE_W;
  const h = n.h ?? NODE_H;
  return [
    { segment: "n", point: { x: n.x + w / 2, y: n.y } },
    { segment: "e", point: { x: n.x + w, y: n.y + h / 2 } },
    { segment: "s", point: { x: n.x + w / 2, y: n.y + h } },
    { segment: "w", point: { x: n.x, y: n.y + h / 2 } },
  ];
}

export function portForHandle(n: PositionedNode, handle: HandleSegment): Point {
  const w = n.w ?? NODE_W;
  const h = n.h ?? NODE_H;
  switch (handle) {
    case "n": return { x: n.x + w / 2, y: n.y };
    case "e": return { x: n.x + w, y: n.y + h / 2 };
    case "s": return { x: n.x + w / 2, y: n.y + h };
    case "w": return { x: n.x, y: n.y + h / 2 };
    default: return { x: n.x + w / 2, y: n.y + h / 2 };
  }
}

export function snappedEdgePath(
  from: PositionedNode,
  to: PositionedNode,
  fromHandle?: HandleSegment,
  toHandle?: HandleSegment,
): { path: string; start: Point; end: Point } {
  const start = fromHandle ? portForHandle(from, fromHandle) : anchorBetween(from, to);
  const end = toHandle ? portForHandle(to, toHandle) : anchorBetween(to, from);
  const dx = end.x - start.x;
  const sign = dx >= 0 ? 1 : -1;
  const cp1x = start.x + sign * Math.min(80, Math.abs(dx) / 2);
  const cp2x = end.x - sign * Math.min(80, Math.abs(dx) / 2);
  const path = `M ${start.x} ${start.y} C ${cp1x} ${start.y}, ${cp2x} ${end.y}, ${end.x} ${end.y}`;
  return { path, start, end };
}

export function smoothstepBetweenNodes(
  from: PositionedNode,
  to: PositionedNode,
  radius = 12,
): string | null {
  if (from.x == null || from.y == null || to.x == null || to.y == null) return null;
  const start = anchorBetween(from, to);
  const end = anchorBetween(to, from);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const isVertical = Math.abs(dy) > Math.abs(dx);
  const r = Math.min(radius, Math.abs(isVertical ? dx : dy) / 2);
  if (isVertical) {
    const midY = start.y + dy / 2;
    if (Math.abs(dx) < 1) return `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
    const signX = dx >= 0 ? 1 : -1;
    return [
      `M ${start.x} ${start.y}`,
      `L ${start.x} ${midY - r}`,
      `Q ${start.x} ${midY} ${start.x + signX * r} ${midY}`,
      `L ${end.x - signX * r} ${midY}`,
      `Q ${end.x} ${midY} ${end.x} ${midY + r}`,
      `L ${end.x} ${end.y}`,
    ].join(" ");
  } else {
    const midX = start.x + dx / 2;
    if (Math.abs(dy) < 1) return `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
    const signY = dy >= 0 ? 1 : -1;
    return [
      `M ${start.x} ${start.y}`,
      `L ${midX - r} ${start.y}`,
      `Q ${midX} ${start.y} ${midX} ${start.y + signY * r}`,
      `L ${midX} ${end.y - signY * r}`,
      `Q ${midX} ${end.y} ${midX + r} ${end.y}`,
      `L ${end.x} ${end.y}`,
    ].join(" ");
  }
}

export function paddingFor(shape: Shape): { x: number; y: number } {
  if (shape === "cylinder") return { x: 16, y: CYLINDER_CAP + 8 };
  if (shape === "diamond") return { x: 32, y: 24 };
  if (shape === "hexagon") return { x: 24, y: 12 };
  return { x: 12, y: 10 };
}

export function textMaxWidth(shape: Shape, _zoom = 1, w = NODE_W): number {
  const pad = paddingFor(shape);
  return w - pad.x * 2;
}
