import { describe, expect, it } from "vitest";
import {
  NODE_W,
  NODE_H,
  CYLINDER_CAP,
  type PositionedNode,
  type Shape,
  anchorBetween,
  anchorHandles,
  boundingBox,
  centerOf,
  halfExtents,
  paddingFor,
  perimeterPoint,
  routeEdge,
  segmentIntersectsBox,
  stadiumRayScale,
  textMaxWidth,
  boundaryPorts,
  portForHandle,
  pickHandles,
  bezierPathBetween,
  snappedEdgePath,
} from "./canvas-geometry";

/** node positioned by its TOP-LEFT corner */
const node = (shape: Shape, x = 0, y = 0): PositionedNode => ({ shape, x, y });
/** node positioned so its geometric CENTER is at (cx, cy) */
const cn = (shape: Shape, cx = 0, cy = 0): PositionedNode => ({
  shape,
  x: cx - NODE_W / 2,
  y: cy - NODE_H / 2,
});

const ZOOMS = [0.4, 0.75, 1, 1.5, 2];
const SHAPES: Shape[] = ["rectangle", "diamond", "cylinder", "pill"];
const ALL_SHAPES: Shape[] = ["rectangle", "diamond", "cylinder", "pill", "triangle", "parallelogram", "document"];

describe("geometry primitives", () => {
  it("centers a node on its footprint", () => {
    expect(centerOf(node("rectangle", 100, 50))).toEqual({ x: 220, y: 100 });
  });

  it("gives cylinders extra vertical hull for caps", () => {
    expect(halfExtents("rectangle").hh).toBe(NODE_H / 2);
    expect(halfExtents("cylinder").hh).toBe((NODE_H + CYLINDER_CAP) / 2);
  });
});

describe("perimeterPoint — shape-aware anchoring", () => {
  it("rectangle: lands on the right edge for a rightward ray", () => {
    const p = perimeterPoint(cn("rectangle"), 1000, 0);
    expect(p.x).toBeCloseTo(NODE_W / 2);
    expect(p.y).toBeCloseTo(0);
  });

  it("rectangle: lands on the top edge for an upward ray", () => {
    const p = perimeterPoint(cn("rectangle"), 0, -1000);
    expect(p.y).toBeCloseTo(-NODE_H / 2);
  });

  it("diamond: a 45° ray lands on the angled face, not a box corner", () => {
    const p = perimeterPoint(cn("diamond"), 1000, 1000);
    const { hw, hh } = halfExtents("diamond");
    expect(Math.abs(p.x) / hw + Math.abs(p.y) / hh).toBeCloseTo(1, 5);
    expect(Math.abs(p.x)).toBeLessThan(hw);
    expect(Math.abs(p.y)).toBeLessThan(hh);
  });

  it("diamond: cardinal rays hit the four vertices exactly", () => {
    const { hw, hh } = halfExtents("diamond");
    expect(perimeterPoint(cn("diamond"), 1000, 0).x).toBeCloseTo(hw);
    expect(perimeterPoint(cn("diamond"), 0, 1000).y).toBeCloseTo(hh);
  });

  it("pill (stadium): rightmost point reaches full half-width", () => {
    expect(perimeterPoint(cn("pill"), 1000, 0).x).toBeCloseTo(NODE_W / 2);
  });

  it("pill (stadium): top-center point reaches full half-height", () => {
    expect(perimeterPoint(cn("pill"), 0, -1000).y).toBeCloseTo(-NODE_H / 2);
  });

  it("pill (stadium): a diagonal stays within the hull", () => {
    const { hw, hh } = halfExtents("pill");
    const p = perimeterPoint(cn("pill"), 1000, 300);
    expect(Math.abs(p.x)).toBeLessThanOrEqual(hw + 1e-6);
    expect(Math.abs(p.y)).toBeLessThanOrEqual(hh + 1e-6);
  });

  it("cylinder: vertical ray clears the elliptical cap hull", () => {
    const p = perimeterPoint(cn("cylinder"), 0, -1000);
    expect(p.y).toBeCloseTo(-(NODE_H + CYLINDER_CAP) / 2);
  });

  it("stadiumRayScale returns positive scalars for all directions", () => {
    for (const [dx, dy] of [
      [1, 0],
      [0, 1],
      [1, 1],
      [-3, 2],
      [0.2, -5],
    ]) {
      expect(stadiumRayScale(dx, dy, NODE_W / 2, NODE_H / 2)).toBeGreaterThan(0);
    }
  });
});

describe("perimeter anchoring is translation- and transform-invariant", () => {
  it("anchor offset from center is identical regardless of node position", () => {
    for (const shape of SHAPES) {
      const a = cn(shape, 0, 0);
      const b = cn(shape, 740, 410);
      const ta = { x: 5000 + centerOf(a).x, y: -3000 + centerOf(a).y };
      const tb = { x: 5000 + centerOf(b).x, y: -3000 + centerOf(b).y };
      const pa = perimeterPoint(a, ta.x, ta.y);
      const pb = perimeterPoint(b, tb.x, tb.y);
      expect(pa.x - centerOf(a).x).toBeCloseTo(pb.x - centerOf(b).x, 6);
      expect(pa.y - centerOf(a).y).toBeCloseTo(pb.y - centerOf(b).y, 6);
    }
  });

  it("anchors always sit on the node hull across zoom transforms", () => {
    for (const shape of SHAPES) {
      const n = cn(shape, 120, 90);
      const { hw, hh } = halfExtents(shape);
      const c = centerOf(n);
      for (const z of ZOOMS) {
        const p = anchorBetween(n, cn(shape, 900, 600));
        const ox = (p.x - c.x) * z;
        const oy = (p.y - c.y) * z;
        const onHull =
          shape === "diamond"
            ? Math.abs(ox) / (hw * z) + Math.abs(oy) / (hh * z)
            : Math.max(Math.abs(ox) / (hw * z), Math.abs(oy) / (hh * z));
        expect(onHull).toBeLessThanOrEqual(1.0001);
      }
    }
  });
});

describe("text clipping rules — no clip at any zoom", () => {
  it("every shape has positive internal padding", () => {
    for (const shape of SHAPES) {
      const pad = paddingFor(shape);
      expect(pad.x).toBeGreaterThan(0);
      expect(pad.y).toBeGreaterThan(0);
    }
  });

  it("diamond wrap width stays within its inscribed rectangle", () => {
    const w = textMaxWidth("diamond", 1);
    expect(w).toBeLessThanOrEqual(NODE_W / 2);
    expect(w).toBeGreaterThan(0);
  });

  it("wrap width never collapses to <= 0 across zooms", () => {
    for (const shape of SHAPES) {
      for (const z of ZOOMS) {
        expect(textMaxWidth(shape, z)).toBeGreaterThan(0);
      }
    }
  });

  it("box shapes wrap inside padding on both sides", () => {
    for (const shape of ["rectangle", "pill", "cylinder"] as Shape[]) {
      const pad = paddingFor(shape);
      expect(textMaxWidth(shape, 1)).toBeCloseTo(NODE_W - pad.x * 2);
    }
  });
});

describe("anchor handles", () => {
  it("diamond exposes its four vertices", () => {
    const h = anchorHandles(cn("diamond", 0, 0));
    expect(h.map((x) => x.id).sort()).toEqual(["e", "n", "s", "w"]);
    const { hw, hh } = halfExtents("diamond");
    expect(h.find((x) => x.id === "n")!.y).toBeCloseTo(-hh);
    expect(h.find((x) => x.id === "e")!.x).toBeCloseTo(hw);
  });

  it("cylinder handles include cap clearance on vertical edges", () => {
    const h = anchorHandles(cn("cylinder", 0, 0));
    expect(h.find((x) => x.id === "s")!.y).toBeCloseTo((NODE_H + CYLINDER_CAP) / 2);
  });
});

describe("collision-aware routing", () => {
  it("detects a segment piercing a box", () => {
    const b = { x: -50, y: -50, w: 100, h: 100 };
    expect(segmentIntersectsBox({ x: -200, y: 0 }, { x: 200, y: 0 }, b)).toBe(true);
    expect(segmentIntersectsBox({ x: -200, y: 500 }, { x: 200, y: 500 }, b)).toBe(false);
  });

  it("routes straight when nothing blocks", () => {
    const a = cn("rectangle", 0, 0);
    const b = cn("rectangle", 600, 0);
    const r = routeEdge(a, b, [a, b]);
    expect(r.detoured).toBe(false);
    expect(r.path).toContain("M ");
    expect(r.path).toContain("C ");
  });

  it("bends around an obstacle node sitting on the straight path", () => {
    const a = cn("rectangle", 0, 250);
    const b = cn("rectangle", 800, 250);
    const blocker = cn("rectangle", 400, 250);
    const r = routeEdge(a, b, [a, b, blocker]);
    expect(r.detoured).toBe(true);
    const off = Math.abs(r.c1.y - 250) + Math.abs(r.c2.y - 250);
    expect(off).toBeGreaterThan(10);
  });

  it("anchors the routed edge on perimeters, not centers", () => {
    const a = cn("pill", 0, 0);
    const b = cn("diamond", 600, 0);
    const r = routeEdge(a, b, [a, b]);
    expect(r.start.x).toBeCloseTo(NODE_W / 2);
    expect(r.end.x).toBeCloseTo(600 - NODE_W / 2);
  });
});

describe("boundingBox", () => {
  it("expands cylinder box vertically for caps", () => {
    expect(boundingBox(node("cylinder", 10, 10)).h).toBe(NODE_H + CYLINDER_CAP);
  });
  it("leaves other shapes at base height", () => {
    expect(boundingBox(node("rectangle", 0, 0)).h).toBe(NODE_H);
  });
});

// ─── Edge-Snapping Path Engine tests ───────────────────────────────────────

describe("boundaryPorts — explicit left/right port lookup", () => {
  it("exposes left and right ports for every shape", () => {
    for (const shape of ALL_SHAPES) {
      const n = cn(shape, 400, 300);
      const { left, right } = boundaryPorts(n);
      expect(left.side).toBe("left");
      expect(right.side).toBe("right");
      expect(right.x).toBeGreaterThan(left.x);
    }
  });

  it("places rectangle ports on the bounding-box edges", () => {
    const n = cn("rectangle", 400, 300);
    const { left, right } = boundaryPorts(n);
    expect(left.x).toBeCloseTo(400 - NODE_W / 2);
    expect(right.x).toBeCloseTo(400 + NODE_W / 2);
    expect(left.y).toBeCloseTo(300);
    expect(right.y).toBeCloseTo(300);
  });

  it("places diamond ports on the true vertices", () => {
    const n = cn("diamond", 400, 300);
    const { left, right } = boundaryPorts(n);
    expect(left.x).toBeCloseTo(400 - NODE_W / 2);
    expect(right.x).toBeCloseTo(400 + NODE_W / 2);
  });

  it("ports are translation-invariant in offset", () => {
    for (const shape of ALL_SHAPES) {
      const a = cn(shape, 0, 0);
      const b = cn(shape, 500, 300);
      const pa = boundaryPorts(a);
      const pb = boundaryPorts(b);
      expect(pb.right.x - pa.right.x).toBeCloseTo(500);
      expect(pb.right.y - pa.right.y).toBeCloseTo(300);
    }
  });
});

describe("portForHandle — resolve handle to absolute port", () => {
  it("resolves 'w' to the left port", () => {
    const n = cn("rectangle", 400, 300);
    const p = portForHandle(n, "w");
    expect(p.x).toBeCloseTo(400 - NODE_W / 2);
  });

  it("resolves 'e' to the right port", () => {
    const n = cn("rectangle", 400, 300);
    const p = portForHandle(n, "e");
    expect(p.x).toBeCloseTo(400 + NODE_W / 2);
  });

  it("resolves 'n' to the top edge midpoint", () => {
    const n = cn("rectangle", 400, 300);
    const p = portForHandle(n, "n");
    expect(p.y).toBeLessThan(300);
  });
});

describe("pickHandles — automatic handle selection", () => {
  it("picks e→w for left-to-right flow", () => {
    const a = cn("rectangle", 0, 0);
    const b = cn("rectangle", 600, 0);
    const { fromHandle, toHandle } = pickHandles(a, b);
    expect(fromHandle).toBe("e");
    expect(toHandle).toBe("w");
  });

  it("picks w→e for right-to-left flow", () => {
    const a = cn("rectangle", 600, 0);
    const b = cn("rectangle", 0, 0);
    const { fromHandle, toHandle } = pickHandles(a, b);
    expect(fromHandle).toBe("w");
    expect(toHandle).toBe("e");
  });
});

describe("bezierPathBetween — smooth cubic-bezier path", () => {
  it("produces a valid SVG path string", () => {
    const path = bezierPathBetween({ x: 0, y: 100 }, { x: 400, y: 200 });
    expect(path).toContain("M 0 100");
    expect(path).toContain("C ");
    expect(path).toContain("400 200");
  });

  it("control points depart horizontally from the start port", () => {
    const start = { x: 100, y: 50 };
    const end = { x: 500, y: 150 };
    const path = bezierPathBetween(start, end, 80);
    expect(path).toContain("180 50");
  });

  it("handles backward (right-to-left) direction", () => {
    const start = { x: 500, y: 50 };
    const end = { x: 100, y: 150 };
    const path = bezierPathBetween(start, end, 80);
    expect(path).toContain("M 500 50");
    expect(path).toContain("420 50");
  });
});

describe("snappedEdgePath — full edge path with port snapping", () => {
  it("snaps to boundary ports when no handles are provided", () => {
    const a = cn("rectangle", 0, 0);
    const b = cn("rectangle", 600, 0);
    const { path, start, end } = snappedEdgePath(a, b);
    expect(start.x).toBeCloseTo(NODE_W / 2);
    expect(end.x).toBeCloseTo(600 - NODE_W / 2);
    expect(path).toContain("M ");
    expect(path).toContain("C ");
  });

  it("respects explicit handles when provided", () => {
    const a = cn("rectangle", 0, 0);
    const b = cn("rectangle", 600, 0);
    const { start, end } = snappedEdgePath(a, b, "e", "w");
    expect(start.x).toBeCloseTo(NODE_W / 2);
    expect(end.x).toBeCloseTo(600 - NODE_W / 2);
  });

  it("produces paths that start and end on the boundary, not the center", () => {
    for (const shape of ALL_SHAPES) {
      const a = cn(shape, 0, 0);
      const b = cn(shape, 600, 200);
      const { start, end } = snappedEdgePath(a, b);
      expect(start.x).toBeGreaterThanOrEqual(0);
      expect(end.x).toBeLessThanOrEqual(600);
    }
  });
});
