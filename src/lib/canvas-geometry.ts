/**
 * canvas-geometry.ts
 *
 * Pure, framework-free geometry helpers for the Repodre execution-flow canvas.
 * Everything here is deterministic and side-effect free so it can be unit tested
 * in isolation and reused by both the renderer and the visual-regression suite.
 *
 * Coordinate convention: node-local space has its origin at the node CENTER,
 * +x to the right and +y downward (matching SVG/screen space).
 *
 * Supported shapes: rectangle · pill · diamond · cylinder ·
 *                   triangle · parallelogram · document · hexagon
 */

export type Shape =
  | "rectangle"
  | "diamond"
  | "cylinder"
  | "pill"
  | "triangle"
  | "parallelogram"
  | "document"
  | "hexagon"
  | "circle";

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

// ---------------------------------------------------------------------------
// Hull half-extents (for AABB-based collision detection and routing)
// ---------------------------------------------------------------------------

/** Half-width / half-height of the *collision/anchor* hull for a shape. */
export function halfExtents(shape: Shape, w = NODE_W, h = NODE_H) {
  // Circle (Bridge) nodes are smaller — half the diameter of a standard node
  if (shape === "circle") {
    const r = Math.min(w, h) / 2;
    return { hw: r, hh: r };
  }
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

// ---------------------------------------------------------------------------
// Polygon helpers — shapes defined in node-local space centred on (0, 0)
// ---------------------------------------------------------------------------

/**
 * Returns the canonical polygon vertices for a shape in node-local space
 * (origin at node center, +x right, +y down).
 * Vertices are listed clockwise.
 */
export function shapePolygon(shape: Shape, w = NODE_W, h = NODE_H): Point[] {
  const hw = w / 2;
  const hh = h / 2;

  switch (shape) {
    case "diamond":
      return [
        { x: 0, y: -hh },   // top vertex
        { x: hw, y: 0 },    // right vertex
        { x: 0, y: hh },    // bottom vertex
        { x: -hw, y: 0 },   // left vertex
      ];

    case "hexagon": {
      // Horizontal hexagon with flat top/bottom (for Role Gateway Switch)
      // The angled portions are 25% of width on each side
      const inset = w * 0.25;
      return [
        { x: -hw + inset, y: -hh },  // top-left
        { x: hw - inset, y: -hh },   // top-right
        { x: hw, y: 0 },             // right vertex
        { x: hw - inset, y: hh },    // bottom-right
        { x: -hw + inset, y: hh },   // bottom-left
        { x: -hw, y: 0 },            // left vertex
      ];
    }

    case "triangle":
      return [
        { x: 0, y: -hh },         // apex
        { x: hw, y: hh },         // bottom-right
        { x: -hw, y: hh },        // bottom-left
      ];

    case "parallelogram": {
      // Classic Input/Output block — right-leaning skew of ~20% of width
      const skew = w * 0.18;
      return [
        { x: -hw + skew, y: -hh },  // top-left
        { x: hw, y: -hh },          // top-right
        { x: hw - skew, y: hh },    // bottom-right
        { x: -hw, y: hh },          // bottom-left
      ];
    }

    case "circle": {
      // Bridge node — approximated as a 16-sided polygon for ray intersection
      const r = Math.min(w, h) / 2;
      const verts: Point[] = [];
      const sides = 16;
      for (let i = 0; i < sides; i++) {
        const angle = (i / sides) * Math.PI * 2;
        verts.push({ x: Math.cos(angle) * r, y: Math.sin(angle) * r });
      }
      return verts;
    }

    // document, rectangle, cylinder, pill all use a rectangular AABB hull for routing
    default: {
      const hh2 = (shape === "cylinder" ? h + CYLINDER_CAP : h) / 2;
      return [
        { x: -hw, y: -hh2 },
        { x: hw, y: -hh2 },
        { x: hw, y: hh2 },
        { x: -hw, y: hh2 },
      ];
    }
  }
}

// ---------------------------------------------------------------------------
// Ray – polygon intersection (Figma-style perimeter snapping)
// ---------------------------------------------------------------------------

/**
 * Given a ray from (0,0) in direction (dx, dy), find the smallest positive t
 * at which it crosses any edge of the polygon.
 *
 * Returns t, so the hit point is (dx*t, dy*t).
 */
function rayPolygonScale(dx: number, dy: number, verts: Point[]): number {
  let bestT = Infinity;
  const n = verts.length;

  for (let i = 0; i < n; i++) {
    const p1 = verts[i];
    const p2 = verts[(i + 1) % n];

    // Edge direction
    const ex = p2.x - p1.x;
    const ey = p2.y - p1.y;

    // Solve: t*dx - s*ex = p1.x
    //        t*dy - s*ey = p1.y
    const denom = dx * ey - dy * ex;
    if (Math.abs(denom) < 1e-10) continue; // parallel

    const t = (p1.x * ey - p1.y * ex) / denom;
    const s = (p1.x * dy - p1.y * dx) / denom;

    if (t > 1e-6 && s >= -1e-6 && s <= 1 + 1e-6) {
      if (t < bestT) bestT = t;
    }
  }

  return bestT === Infinity ? 1 : bestT;
}

// ---------------------------------------------------------------------------
// Public perimeter API
// ---------------------------------------------------------------------------

/**
 * Shape-aware perimeter intersection.
 * Returns the point on the node boundary that lies along the ray from the node
 * centre toward (tx, ty) in CANVAS space.
 */
export function perimeterPoint(n: PositionedNode, tx: number, ty: number): Point {
  const c = centerOf(n);
  const dx = tx - c.x;
  const dy = ty - c.y;
  if (dx === 0 && dy === 0) return { ...c };

  const w = n.w ?? NODE_W;
  const h = n.h ?? NODE_H;
  const { hw, hh } = halfExtents(n.shape, w, h);

  let s: number;

  switch (n.shape) {
    case "pill":
      s = stadiumRayScale(dx, dy, hw, hh);
      break;

    case "circle": {
      // True circle perimeter: scale ray to radius
      const r = Math.min(w, h) / 2;
      const len = Math.hypot(dx, dy);
      s = r / len;
      break;
    }

    case "diamond":
    case "hexagon":
    case "triangle":
    case "parallelogram": {
      const verts = shapePolygon(n.shape, w, h);
      s = rayPolygonScale(dx, dy, verts);
      break;
    }

    default:
      // rectangle, cylinder, document => axis-aligned box
      s = 1 / Math.max(Math.abs(dx) / hw, Math.abs(dy) / hh);
      break;
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

// ---------------------------------------------------------------------------
// Anchor handles
// ---------------------------------------------------------------------------

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
 * Named anchor handles placed on a node's true perimeter.
 * Polygon shapes expose their vertices; box-like shapes expose edge midpoints.
 */
export function anchorHandles(n: PositionedNode): AnchorHandle[] {
  const c = centerOf(n);
  const w = n.w ?? NODE_W;
  const h = n.h ?? NODE_H;
  const { hw, hh } = halfExtents(n.shape, w, h);
  const at = (id: HandleSegment, ox: number, oy: number, label: string): AnchorHandle => ({
    id, x: c.x + ox, y: c.y + oy, label,
  });

  switch (n.shape) {
    case "diamond":
      return [
        at("n", 0, -hh, "Top vertex"),
        at("e", hw, 0, "Right vertex"),
        at("s", 0, hh, "Bottom vertex"),
        at("w", -hw, 0, "Left vertex"),
      ];

    case "hexagon": {
      // Horizontal hexagon with flat top/bottom
      const inset = w * 0.25;
      return [
        at("n", 0, -hh, "Top edge"),
        at("ne", hw - inset, -hh, "Top-right corner"),
        at("e", hw, 0, "Right vertex"),
        at("se", hw - inset, hh, "Bottom-right corner"),
        at("s", 0, hh, "Bottom edge"),
        at("sw", -hw + inset, hh, "Bottom-left corner"),
        at("w", -hw, 0, "Left vertex"),
        at("nw", -hw + inset, -hh, "Top-left corner"),
      ];
    }

    case "triangle": {
      const hw2 = w / 2;
      const hh2 = h / 2;
      return [
        at("n", 0, -hh2, "Apex"),
        at("se", hw2, hh2, "Right corner"),
        at("sw", -hw2, hh2, "Left corner"),
        at("s", 0, hh2, "Base midpoint"),
      ];
    }

    case "parallelogram": {
      const skew = w * 0.18;
      const hw2 = w / 2;
      const hh2 = h / 2;
      return [
        at("n", skew / 2, -hh2, "Top midpoint"),
        at("e", hw2, 0, "Right midpoint"),
        at("s", -skew / 2, hh2, "Bottom midpoint"),
        at("w", -hw2, 0, "Left midpoint"),
      ];
    }

    case "circle": {
      const r = Math.min(w, h) / 2;
      return [
        at("n", 0, -r, "Top"),
        at("e", r, 0, "Right"),
        at("s", 0, r, "Bottom"),
        at("w", -r, 0, "Left"),
      ];
    }

    default:
      // rectangle / pill / cylinder / document: edge midpoints
      return [
        at("n", 0, -hh, "Top edge"),
        at("e", hw, 0, "Right edge"),
        at("s", 0, hh, "Bottom edge"),
        at("w", -hw, 0, "Left edge"),
      ];
  }
}

// ---------------------------------------------------------------------------
// Text padding / wrapping
// ---------------------------------------------------------------------------

/**
 * Internal padding (px) so text never clips inside the shape's narrow corners.
 * These values define the inset from the node's bounding rect.
 */
export function paddingFor(shape: Shape): { x: number; y: number } {
  switch (shape) {
    case "diamond":
      return { x: 12, y: 10 };
    case "hexagon":
      // Hexagon has angled sides, need inset padding
      return { x: 24, y: 14 };
    case "cylinder":
      return { x: 18, y: 24 };
    case "pill":
      return { x: 28, y: 14 };
    case "triangle":
      // text lives in the lower ~60 % of the triangle; wide bottom margin
      return { x: 20, y: 14 };
    case "parallelogram":
      // account for horizontal skew on both sides
      return { x: 32, y: 12 };
    case "document":
      // leave room for folded corner decoration (bottom-right)
      return { x: 16, y: 14 };
    case "circle":
      // Bridge nodes are small; tight padding so the label fits
      return { x: 10, y: 8 };
    default:
      return { x: 16, y: 12 };
  }
}

/**
 * Max text width (px) that fits inside the shape without clipping.
 *
 * Shape-specific inscribed-rectangle rules:
 *   diamond      → inscribed square width = w / √2
 *   triangle     → at the vertical mid-point, available width = w / 2
 *                  (conservative; keeps text safely inside the slanted faces)
 *   parallelogram → full width minus both skew offsets
 *   others       → full width minus side padding
 */
export function textMaxWidth(shape: Shape, _zoom = 1, w = NODE_W, h = NODE_H): number {
  switch (shape) {
    case "diamond": {
      // Safe text width = horizontal half-diagonal minus padding.
      // At the centre row the diamond spans its full half-width (hw = w/2);
      // the inscribed rect width is bounded by hw so text never reaches the faces.
      const pad = paddingFor("diamond");
      return Math.max(24, w / 2 - pad.x);
    }

    case "hexagon": {
      // Hexagon center has full width minus the angled portions (25% on each side)
      // At center, the horizontal span is full width
      const pad = paddingFor("hexagon");
      return Math.max(24, w - pad.x * 2);
    }

    case "triangle":
      // at mid-height the available horizontal span is w/2
      return Math.max(24, w * 0.5 - 16);

    case "parallelogram": {
      const skew = w * 0.18;
      return Math.max(24, w - skew * 2 - 16);
    }

    case "pill":
      return Math.max(24, w - 56);

    case "cylinder":
      return Math.max(24, w - 36);

    case "document":
      return Math.max(24, w - 40);

    case "circle":
      // Inscribed square in a circle: width = r * √2
      return Math.max(20, Math.min(w, h) * 0.707 - 16);

    default:
      return Math.max(24, w - 32);
  }
}

// ---------------------------------------------------------------------------
// Explicit anchor-port lookup (left / right boundary ports)
// ---------------------------------------------------------------------------

/**
 * A connection port is an absolute canvas-space point on a node's left or
 * right boundary, plus the vertical center. Every flowchart node and every
 * ERD table row exposes these so the edge engine can snap wires to exact
 * boundary coordinates instead of recomputing from geometry each frame.
 */
export interface ConnectionPort {
  /** "left" or "right" boundary of the node */
  side: "left" | "right";
  /** absolute canvas-space x of the port */
  x: number;
  /** absolute canvas-space y of the port */
  y: number;
}

/**
 * Return the left and right boundary ports for a flowchart node.
 *
 * The y-coordinate is the node's vertical center. For shapes with a
 * non-rectangular hull (diamond, triangle, parallelogram) the x-coordinate
 * is the true perimeter vertex, not the bounding-box edge, so wires snap
 * exactly to the visual boundary.
 */
export function boundaryPorts(n: PositionedNode): { left: ConnectionPort; right: ConnectionPort } {
  const c = centerOf(n);
  const w = n.w ?? NODE_W;
  const h = n.h ?? NODE_H;
  const { hw, hh } = halfExtents(n.shape, w, h);

  switch (n.shape) {
    case "diamond":
      return {
        left:  { side: "left",  x: c.x - hw, y: c.y },
        right: { side: "right", x: c.x + hw, y: c.y },
      };

    case "hexagon": {
      // The left/right vertices are at the horizontal extremes
      return {
        left:  { side: "left",  x: c.x - hw, y: c.y },
        right: { side: "right", x: c.x + hw, y: c.y },
      };
    }

    case "triangle": {
      // Left/right corners are at the base; use bounding-box x for the sides
      // but keep y at center so horizontal connectors look natural.
      return {
        left:  { side: "left",  x: c.x - w / 2, y: c.y + hh / 2 },
        right: { side: "right", x: c.x + w / 2, y: c.y + hh / 2 },
      };
    }

    case "parallelogram": {
      const skew = w * 0.18;
      return {
        left:  { side: "left",  x: c.x - w / 2 + skew / 2, y: c.y },
        right: { side: "right", x: c.x + w / 2 - skew / 2, y: c.y },
      };
    }

    case "circle": {
      const r = Math.min(w, h) / 2;
      return {
        left:  { side: "left",  x: c.x - r, y: c.y },
        right: { side: "right", x: c.x + r, y: c.y },
      };
    }

    default:
      // rectangle, pill, cylinder, document
      return {
        left:  { side: "left",  x: c.x - hw, y: c.y },
        right: { side: "right", x: c.x + hw, y: c.y },
      };
  }
}

/**
 * Resolve a HandleSegment to an absolute canvas-space port point.
 * Falls back to the closest left/right boundary port for cardinal handles,
 * and uses anchorHandles for diagonal handles.
 */
export function portForHandle(n: PositionedNode, handle: HandleSegment): Point {
  const { left, right } = boundaryPorts(n);
  if (handle === "w") return { x: left.x, y: left.y };
  if (handle === "e") return { x: right.x, y: right.y };

  const handles = anchorHandles(n);
  const h = handles.find((x) => x.id === handle);
  return h ? { x: h.x, y: h.y } : centerOf(n);
}

/**
 * Pick the best handle for a directed connection between two nodes.
 * Returns the source-side and target-side handles based on relative
 * horizontal position (left-to-right flow by default).
 */
export function pickHandles(
  from: PositionedNode,
  to: PositionedNode
): { fromHandle: HandleSegment; toHandle: HandleSegment } {
  const fromCenter = centerOf(from);
  const toCenter = centerOf(to);
  if (toCenter.x >= fromCenter.x) {
    return { fromHandle: "e", toHandle: "w" };
  }
  return { fromHandle: "w", toHandle: "e" };
}

// ---------------------------------------------------------------------------
// Dynamic cubic-bezier path builder (snap-to-port)
// ---------------------------------------------------------------------------

/**
 * Build a smooth cubic-bezier SVG path between two explicit port points.
 *
 * The control points are offset horizontally from each endpoint, producing
 * a gentle S-curve that exits the source port perpendicular to the boundary
 * and enters the target port the same way. This guarantees the wire never
 * clips into node geometry because it departs orthogonally from the port.
 *
 * @param start - absolute canvas-space start port
 * @param end   - absolute canvas-space end port
 * @param curvature - how far control points extend horizontally (px)
 */
export function bezierPathBetween(
  start: Point,
  end: Point,
  curvature = 140,
): string {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  // Use a smoothstep-style bezier: control points extend in the direction
  // of travel by `curvature`. For near-vertical edges (typical in tree
  // layouts), bias the control points vertically so the curve exits
  // perpendicular to the port and flows predictably between tiers.
  const isVertical = Math.abs(dy) > Math.abs(dx);
  if (isVertical) {
    const sign = dy >= 0 ? 1 : -1;
    const cp1y = start.y + sign * curvature;
    const cp2y = end.y - sign * curvature;
    return `M ${start.x} ${start.y} C ${start.x} ${cp1y}, ${end.x} ${cp2y}, ${end.x} ${end.y}`;
  }
  const sign = dx >= 0 ? 1 : -1;
  const cp1x = start.x + sign * curvature;
  const cp2x = end.x - sign * curvature;
  return `M ${start.x} ${start.y} C ${cp1x} ${start.y}, ${cp2x} ${end.y}, ${end.x} ${end.y}`;
}

/**
 * Compute a snapped edge path between two nodes using explicit port lookup.
 *
 * If handles are provided they are resolved to exact port coordinates.
 * Otherwise the best left/right ports are picked automatically based on
 * relative position. The resulting cubic-bezier path is guaranteed to
 * start and end on the node boundary (not the center), preventing clipping.
 */
export function snappedEdgePath(
  from: PositionedNode,
  to: PositionedNode,
  fromHandle?: HandleSegment,
  toHandle?: HandleSegment,
): { path: string; start: Point; end: Point } {
  let start: Point;
  let end: Point;

  if (fromHandle) {
    start = portForHandle(from, fromHandle);
  } else {
    const { fromHandle: fh } = pickHandles(from, to);
    start = portForHandle(from, fh);
  }

  if (toHandle) {
    end = portForHandle(to, toHandle);
  } else {
    const { toHandle: th } = pickHandles(from, to);
    end = portForHandle(to, th);
  }

  const path = bezierPathBetween(start, end);
  return { path, start, end };
}

// ---------------------------------------------------------------------------
// Collision-aware routing
// ---------------------------------------------------------------------------

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
 *  - anchors on each node's true perimeter (shape-aware polygon snapping),
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
    // Smoothstep-style bezier: bias control points in the dominant direction
    // of travel so edges flow predictably between tree tiers rather than
    // cutting corners. Higher offset = gentler curve.
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const isVertical = Math.abs(dy) > Math.abs(dx);
    if (isVertical) {
      const sign = dy >= 0 ? 1 : -1;
      c1 = { x: start.x, y: start.y + sign * 140 };
      c2 = { x: end.x, y: end.y - sign * 140 };
    } else {
      const sign = dx >= 0 ? 1 : -1;
      c1 = { x: start.x + sign * 140, y: start.y };
      c2 = { x: end.x - sign * 140, y: end.y };
    }
  } else {
    detoured = true;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;

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
    if (bestOffset === 0) bestOffset = 140;
    const bend: Point = { x: mx + nx * bestOffset, y: my + ny * bestOffset };
    c1 = { x: (start.x + bend.x) / 2, y: (start.y + bend.y) / 2 };
    c2 = { x: (end.x + bend.x) / 2, y: (end.y + bend.y) / 2 };
  }

  const path = `M ${start.x} ${start.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${end.x} ${end.y}`;
  return { start, end, c1, c2, path, detoured };
}

// ---------------------------------------------------------------------------
// Smoothstep orthogonal routing (swimlane layout)
// ---------------------------------------------------------------------------

/**
 * Build a clean orthogonal "smoothstep" path between two nodes.
 *
 * Rules:
 *   - Cross-lane (|dx| > 60): exit RIGHT of source → midX turn → enter LEFT of target
 *   - Left-ward (backward):   exit LEFT → midX turn → enter RIGHT
 *   - Same-lane downward:     exit BOTTOM → midY turn → enter TOP
 *   - Same-lane upward:       exit TOP → midY turn → enter BOTTOM
 *
 * Turns are rounded with small quadratic bezier arcs (`radius` px).
 * `bundleOffset` shifts the path perpendicular to avoid pile-ups on
 * heavily-connected targets.
 */
export function smoothstepEdgePath(
  from: PositionedNode,
  to: PositionedNode,
  bundleOffset = 0,
  radius = 12,
): string {
  const fw = from.w ?? NODE_W;
  const fh = from.h ?? NODE_H;
  const tw = to.w ?? NODE_W;
  const th = to.h ?? NODE_H;

  const fcx = from.x + fw / 2;
  const fcy = from.y + fh / 2;
  const tcx = to.x + tw / 2;
  const tcy = to.y + th / 2;

  const dx = tcx - fcx;
  const dy = tcy - fcy;

  const isCrossLane = Math.abs(dx) > 60;

  let sx: number, sy: number;
  let ex: number, ey: number;

  if (isCrossLane && dx > 0) {
    sx = from.x + fw;    sy = fcy + bundleOffset;
    ex = to.x;           ey = tcy + bundleOffset;
  } else if (isCrossLane && dx < 0) {
    sx = from.x;         sy = fcy + bundleOffset;
    ex = to.x + tw;      ey = tcy + bundleOffset;
  } else if (dy >= 0) {
    sx = fcx + bundleOffset; sy = from.y + fh;
    ex = tcx + bundleOffset; ey = to.y;
  } else {
    sx = fcx + bundleOffset; sy = from.y;
    ex = tcx + bundleOffset; ey = to.y + th;
  }

  // Straight-line shortcuts
  if (Math.abs(sx - ex) < 1) return `M ${sx} ${sy} V ${ey}`;
  if (Math.abs(sy - ey) < 1) return `M ${sx} ${sy} H ${ex}`;

  const r = Math.max(0, Math.min(radius, Math.abs(ex - sx) / 2 - 1, Math.abs(ey - sy) / 2 - 1));

  if (isCrossLane) {
    // H → (turn) → V → (turn) → H
    const midX = (sx + ex) / 2;
    const sv = ey > sy ? 1 : -1;

    if (r < 1) return `M ${sx} ${sy} H ${midX} V ${ey} H ${ex}`;

    return [
      `M ${sx} ${sy}`,
      `H ${midX - r}`,
      `Q ${midX} ${sy} ${midX} ${sy + sv * r}`,
      `V ${ey - sv * r}`,
      `Q ${midX} ${ey} ${midX + r} ${ey}`,
      `H ${ex}`,
    ].join(" ");
  } else {
    // V → (turn) → H → (turn) → V
    const midY = (sy + ey) / 2;
    const sh = ex > sx ? 1 : -1;

    if (r < 1) return `M ${sx} ${sy} V ${midY} H ${ex} V ${ey}`;

    return [
      `M ${sx} ${sy}`,
      `V ${midY - r}`,
      `Q ${sx} ${midY} ${sx + sh * r} ${midY}`,
      `H ${ex - sh * r}`,
      `Q ${ex} ${midY} ${ex} ${midY + r}`,
      `V ${ey}`,
    ].join(" ");
  }
}

// ---------------------------------------------------------------------------
// Crossing detection and hop-arc insertion
// ---------------------------------------------------------------------------

export interface OrthoSegment {
  x1: number; y1: number;
  x2: number; y2: number;
  /** true = horizontal segment */
  isH: boolean;
}

/**
 * Parse an orthogonal SVG path string (produced by `smoothstepEdgePath`) into
 * a list of H/V line segments. Q commands are skipped — they represent
 * rounded corners whose arcs don't participate in straight-line crossings.
 */
export function extractOrthoSegments(path: string): OrthoSegment[] {
  const segs: OrthoSegment[] = [];
  let cx = 0, cy = 0;

  const re = /([MHVQ])\s*([-\d. ,]+)/g;
  let m: RegExpExecArray | null;

  while ((m = re.exec(path)) !== null) {
    const cmd = m[1];
    const ns = m[2].trim().split(/[\s,]+/).map(Number).filter(n => !isNaN(n));
    if (cmd === "M") {
      cx = ns[0]; cy = ns[1];
    } else if (cmd === "H") {
      const nx = ns[0];
      segs.push({ x1: cx, y1: cy, x2: nx, y2: cy, isH: true });
      cx = nx;
    } else if (cmd === "V") {
      const ny = ns[0];
      segs.push({ x1: cx, y1: cy, x2: cx, y2: ny, isH: false });
      cy = ny;
    } else if (cmd === "Q") {
      // Quadratic bezier: update current position to end point (ns[2], ns[3])
      cx = ns[2]; cy = ns[3];
    }
  }
  return segs;
}

/**
 * Find all X positions where a horizontal segment of `path` is crossed by
 * a vertical segment of any other path in `allPaths`.
 *
 * Returns a map from path ID → sorted array of crossing X positions.
 */
export function findPathCrossings(
  allPaths: Array<{ id: string; path: string }>,
): Map<string, number[]> {
  const result = new Map<string, number[]>();

  // Build segment index
  const byId = new Map<string, OrthoSegment[]>();
  for (const { id, path } of allPaths) {
    byId.set(id, extractOrthoSegments(path));
  }

  const ids = allPaths.map(p => p.id);

  for (let i = 0; i < ids.length; i++) {
    const idA = ids[i];
    const hSegs = (byId.get(idA) ?? []).filter(s => s.isH);
    if (hSegs.length === 0) continue;

    for (let j = 0; j < ids.length; j++) {
      if (i === j) continue;
      const idB = ids[j];
      const vSegs = (byId.get(idB) ?? []).filter(s => !s.isH);

      for (const h of hSegs) {
        const hMinX = Math.min(h.x1, h.x2);
        const hMaxX = Math.max(h.x1, h.x2);

        for (const v of vSegs) {
          const vMinY = Math.min(v.y1, v.y2);
          const vMaxY = Math.max(v.y1, v.y2);

          // Skip T-intersections: only count genuine crossings (not endpoints)
          if (
            v.x1 > hMinX + 1 && v.x1 < hMaxX - 1 &&
            h.y1 > vMinY + 1 && h.y1 < vMaxY - 1
          ) {
            const arr = result.get(idA) ?? [];
            arr.push(v.x1);
            result.set(idA, arr);
          }
        }
      }
    }
  }

  // Sort each list
  for (const [id, xs] of result) result.set(id, [...new Set(xs)].sort((a, b) => a - b));

  return result;
}

/**
 * Insert small upward hop arcs at the given X crossing positions within a
 * horizontal segment of the path string.
 *
 * The arc is a counterclockwise semicircle: `a R R 0 0 0 2R 0`
 * which creates a visible bump "over" the crossing vertical line.
 */
export function insertHopArcs(path: string, crossingXs: number[], R = 5): string {
  if (crossingXs.length === 0) return path;

  let cx = 0;
  const parts: string[] = [];

  const re = /([MHVQ])\s*([-\d. ,]+)/g;
  let m: RegExpExecArray | null;

  while ((m = re.exec(path)) !== null) {
    const cmd = m[1];
    const raw = m[2].trim();
    const ns = raw.split(/[\s,]+/).map(Number).filter(n => !isNaN(n));

    if (cmd === "M") {
      cx = ns[0];
      parts.push(`M ${ns[0]} ${ns[1]}`);
    } else if (cmd === "H") {
      const tx = ns[0];
      const dir = tx >= cx ? 1 : -1;
      const inRange = crossingXs.filter(
        kx => dir === 1 ? (kx > cx + R + 1 && kx < tx - R - 1)
                        : (kx < cx - R - 1 && kx > tx + R + 1)
      ).sort((a, b) => dir * (a - b));

      if (inRange.length === 0) {
        parts.push(`H ${tx}`);
      } else {
        let px = cx;
        for (const kx of inRange) {
          parts.push(`H ${kx - dir * R}`);
          // Counterclockwise arc (sweep 0) bumps upward on a rightward line
          parts.push(`a ${R} ${R} 0 0 ${dir === 1 ? 0 : 1} ${dir * 2 * R} 0`);
          px = kx + dir * R;
        }
        parts.push(`H ${tx}`);
      }
      cx = tx;
    } else if (cmd === "V") {
      parts.push(`V ${ns[0]}`);
    } else if (cmd === "Q") {
      parts.push(`Q ${raw}`);
      cx = ns[2];
    }
  }

  return parts.join(" ");
}
