/**
 * canvas-geometry.ts
 *
 * Pure, framework-free geometry helpers for the Repodre execution-flow canvas.
 * Everything here is deterministic and side-effect free so it can be unit tested
 * in isolation and reused by both the renderer and the visual-regression suite.
 *
 * Coordinate convention: node-local space has its origin at the node CENTER,
 * +x to the right and +y downward (matching SVG/screen space).
 */

export type Shape = "rectangle" | "diamond" | "cylinder" | "pill";

/** Base node footprint (unscaled, pre-zoom). */
export const NODE_W = 240;
export const NODE_H = 100;
/** Extra vertical room a cylinder needs so its elliptical caps clear connectors. */
export const CYLINDER_CAP = 16;

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface PositionedNode {
  shape: Shape;
  /** top-left corner in canvas space */
  x: number;
  y: number;
  w?: number;
  h?: number;
}

/** Half-width / half-height of the *collision/anchor* hull for a shape. */
export function halfExtents(shape: Shape, w = NODE_W, h = NODE_H) {
  const hw = w / 2;
  const hh = (shape === "cylinder" ? h + CYLINDER_CAP : h) / 2;
  return { hw, hh };
}

export function centerOf(n: PositionedNode): Point {
  const w = n.w ?? NODE_W;
  const h = n.h ?? NODE_H;
  return { x: n.x + w / 2, y: n.y + h / 2 };
}

export function boundingBox(n: PositionedNode): Box {
  const w = n.w ?? NODE_W;
  const h = n.h ?? NODE_H;
  const extraTop = n.shape === "cylinder" ? CYLINDER_CAP / 2 : 0;
  return { x: n.x, y: n.y - extraTop, w, h: h + (n.shape === "cylinder" ? CYLINDER_CAP : 0) };
}

/**
 * Shape-aware perimeter intersection.
 * Returns the point on the node boundary that lies along the ray from the node
 * center toward (tx, ty) in CANVAS space.
 */
export function perimeterPoint(n: PositionedNode, tx: number, ty: number): Point {
  const c = centerOf(n);
  const dx = tx - c.x;
  const dy = ty - c.y;
  if (dx === 0 && dy === 0) return { ...c };

  const { hw, hh } = halfExtents(n.shape, n.w ?? NODE_W, n.h ?? NODE_H);
  let s: number;

  if (n.shape === "diamond") {
    // Rhombus boundary: |x|/hw + |y|/hh = 1
    s = 1 / (Math.abs(dx) / hw + Math.abs(dy) / hh);
  } else if (n.shape === "pill") {
    s = stadiumRayScale(dx, dy, hw, hh);
  } else {
    // rectangle + cylinder => axis-aligned box
    s = 1 / Math.max(Math.abs(dx) / hw, Math.abs(dy) / hh);
  }

  return { x: c.x + dx * s, y: c.y + dy * s };
}

/**
 * Scale `s` so that s*(dx,dy) lands on a horizontal stadium (pill) boundary:
 * a rectangle of half-extents (hw, hh) capped by semicircles of radius hh on
 * the left/right ends. Returns the positive scalar for the boundary hit.
 */
export function stadiumRayScale(dx: number, dy: number, hw: number, hh: number): number {
  const r = hh; // cap radius
  const flatHalf = Math.max(0, hw - r); // x-extent of the straight top/bottom run

  // 1) try the flat top/bottom edges (y = ±hh)
  if (dy !== 0) {
    const s = hh / Math.abs(dy);
    const x = dx * s;
    if (Math.abs(x) <= flatHalf) return s;
  }
  // 2) otherwise it exits through a rounded cap centered at (±flatHalf, 0)
  const cx = Math.sign(dx || 1) * flatHalf;
  // solve |s*(dx,dy) - (cx,0)| = r  ->  a s^2 + b s + cc = 0
  const a = dx * dx + dy * dy;
  const b = -2 * dx * cx;
  const cc = cx * cx - r * r;
  const disc = Math.max(0, b * b - 4 * a * cc);
  const s = (-b + Math.sqrt(disc)) / (2 * a);
  return s;
}

/** Perimeter anchor of `from` pointing at the center of `to`. */
export function anchorBetween(from: PositionedNode, to: PositionedNode): Point {
  const c = centerOf(to);
  return perimeterPoint(from, c.x, c.y);
}

export type HandleSegment = "n" | "e" | "s" | "w" | "ne" | "se" | "sw" | "nw";

export interface AnchorHandle {
  id: HandleSegment;
  /** canvas-space coordinates */
  x: number;
  y: number;
  /** human label for the segment of perimeter this handle owns */
  label: string;
}

/**
 * Named anchor handles around a node's true perimeter. Diamonds expose their
 * four vertices (the corners that connectors should snap to); box-like shapes
 * expose edge midpoints.
 */
export function anchorHandles(n: PositionedNode): AnchorHandle[] {
  const c = centerOf(n);
  const { hw, hh } = halfExtents(n.shape, n.w ?? NODE_W, n.h ?? NODE_H);
  const make = (id: HandleSegment, ox: number, oy: number, label: string): AnchorHandle => ({
    id,
    x: c.x + ox,
    y: c.y + oy,
    label,
  });

  if (n.shape === "diamond") {
    return [
      make("n", 0, -hh, "Top vertex"),
      make("e", hw, 0, "Right vertex"),
      make("s", 0, hh, "Bottom vertex"),
      make("w", -hw, 0, "Left vertex"),
    ];
  }
  // rectangle / pill / cylinder: edge midpoints
  return [
    make("n", 0, -hh, "Top edge"),
    make("e", hw, 0, "Right edge"),
    make("s", 0, hh, "Bottom edge"),
    make("w", -hw, 0, "Left edge"),
  ];
}

/** Internal padding (px) so text never clips inside the shape's narrow corners. */
export function paddingFor(shape: Shape): { x: number; y: number } {
  switch (shape) {
    case "diamond":
      // narrow corners: small inset; the inscribed-rect maxWidth does the heavy
      // lifting so the label never reaches the angled faces.
      return { x: 10, y: 8 };
    case "cylinder":
      // leave room for top + bottom elliptical caps
      return { x: 18, y: 20 };
    case "pill":
      return { x: 26, y: 12 };
    default:
      return { x: 16, y: 12 };
  }
}

/**
 * Max text width (px) that fits without clipping, accounting for the shape and
 * the current zoom factor (1 = 100%). The diamond uses its inscribed rectangle
 * (half the diagonal) so labels never spill past the angled faces.
 */
export function textMaxWidth(shape: Shape, zoom = 1, w = NODE_W, h = NODE_H): number {
  const pad = paddingFor(shape);
  let base: number;
  if (shape === "diamond") {
    // inscribed axis-aligned rect of a rhombus is ~w/2 wide at center height
    base = w / 2 - pad.x;
  } else {
    base = w - pad.x * 2;
  }
  // zoom never reduces the *logical* wrap width (text scales with the canvas),
  // but we clamp to a sane minimum so tiny zooms don't produce 0/negative.
  return Math.max(24, base);
}

// ---------- collision-aware routing ----------

/** Does segment p->q intersect axis-aligned box b (with optional padding)? */
export function segmentIntersectsBox(p: Point, q: Point, b: Box, pad = 0): boolean {
  const minX = b.x - pad;
  const minY = b.y - pad;
  const maxX = b.x + b.w + pad;
  const maxY = b.y + b.h + pad;

  // Liang–Barsky clipping
  let t0 = 0;
  let t1 = 1;
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const clip = (pp: number, qq: number): boolean => {
    if (pp === 0) return qq >= 0; // parallel
    const r = qq / pp;
    if (pp < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
    return true;
  };
  if (
    clip(-dx, p.x - minX) &&
    clip(dx, maxX - p.x) &&
    clip(-dy, p.y - minY) &&
    clip(dy, maxY - p.y)
  ) {
    return t0 < t1;
  }
  return false;
}

export interface RoutedEdge {
  start: Point;
  end: Point;
  /** cubic bezier control points */
  c1: Point;
  c2: Point;
  path: string;
  /** true when the route was bent to dodge an obstacle */
  detoured: boolean;
}

/**
 * Build a connector path between two nodes that:
 *  - anchors on each node's true perimeter (shape-aware),
 *  - bends around any *other* node boxes it would otherwise pierce/overlap.
 */
export function routeEdge(
  from: PositionedNode,
  to: PositionedNode,
  obstacles: PositionedNode[] = [],
  pad = 18,
): RoutedEdge {
  const start = anchorBetween(from, to);
  const end = anchorBetween(to, from);

  const boxes = obstacles
    .filter((o) => o !== from && o !== to)
    .map((o) => boundingBox(o));

  const blocked = boxes.some((b) => segmentIntersectsBox(start, end, b, pad));

  const mx = (start.x + end.x) / 2;
  const my = (start.y + end.y) / 2;

  let c1: Point;
  let c2: Point;
  let detoured = false;

  if (!blocked) {
    // smooth horizontal-biased bezier (matches original aesthetic)
    c1 = { x: mx, y: start.y };
    c2 = { x: mx, y: end.y };
  } else {
    detoured = true;
    // perpendicular offset direction
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;

    // try increasing offsets on both sides until clear
    let bestOffset = 0;
    outer: for (const mag of [60, 100, 150, 210, 280]) {
      for (const sign of [1, -1]) {
        const off = mag * sign;
        const bend: Point = { x: mx + nx * off, y: my + ny * off };
        const clearA = !boxes.some((b) => segmentIntersectsBox(start, bend, b, pad));
        const clearB = !boxes.some((b) => segmentIntersectsBox(bend, end, b, pad));
        if (clearA && clearB) {
          bestOffset = off;
          break outer;
        }
      }
    }
    if (bestOffset === 0) bestOffset = 140; // fallback bend
    const bend: Point = { x: mx + nx * bestOffset, y: my + ny * bestOffset };
    c1 = { x: (start.x + bend.x) / 2, y: (start.y + bend.y) / 2 };
    c2 = { x: (end.x + bend.x) / 2, y: (end.y + bend.y) / 2 };
  }

  const path = `M ${start.x} ${start.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${end.x} ${end.y}`;
  return { start, end, c1, c2, path, detoured };
}
