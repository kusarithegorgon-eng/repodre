/**
 * Edge Routing Engine — Orthogonal Paths + Bundling + Crossings
 *
 * Provides enhanced edge routing for flowcharts:
 *   - Orthogonal smoothstep routing (90-degree angles)
 *   - Edge bundling for grouped connections
 *   - Crossing detection with jump arcs
 *   - Z-index layering for edge rendering order
 */

import type { Point, PositionedNode, Shape } from "./canvas-geometry";
import { NODE_W, NODE_H, centerOf, halfExtents } from "./canvas-geometry";

export interface EdgeRoute {
  id: string;
  path: string;
  /** Bundle group ID if this edge is bundled with others */
  bundleId?: string;
  /** Z-index for rendering (lower = behind) */
  zIndex: number;
  /** Crossing positions where jump arcs should be inserted */
  crossings: number[];
  /** Source node ID */
  fromId: string;
  /** Target node ID */
  toId: string;
}

export interface BundleGroup {
  id: string;
  /** Edges in this bundle (from node IDs) */
  sourceNodes: string[];
  /** Target node all sources connect to */
  targetNode: string;
  /** Common exit point for bundled edges */
  bundleExitPoint: Point;
  /** The main trunk path from bundle exit to target */
  trunkPath: string;
}

export interface RoutingOptions {
  /** Radius for smoothstep corner arcs */
  cornerRadius: number;
  /** Gap for crossing jump arcs */
  jumpArcRadius: number;
  /** Whether to bundle edges */
  enableBundling: boolean;
  /** Minimum edges to form a bundle */
  bundleThreshold: number;
  /** Horizontal offset per bundled edge */
  bundleSpread: number;
}

const DEFAULT_ROUTING_OPTIONS: RoutingOptions = {
  cornerRadius: 12,
  jumpArcRadius: 5,
  enableBundling: true,
  bundleThreshold: 2,
  bundleSpread: 16,
};

/**
 * Build orthogonal smoothstep paths for a set of edges with bundling support.
 *
 * @param nodes - Map of node ID to positioned node
 * @param edges - List of edges to route (from, to, id)
 * @param options - Routing configuration
 */
export function routeOrthogonalEdges(
  nodePositions: Map<string, PositionedNode>,
  edges: Array<{ id: string; from: string; to: string; label?: string }>,
  options: Partial<RoutingOptions> = {}
): Map<string, EdgeRoute> {
  const opts = { ...DEFAULT_ROUTING_OPTIONS, ...options };
  const routes = new Map<string, EdgeRoute>();
  const paths = new Map<string, string>();

  if (opts.enableBundling) {
    // Find bundle groups
    const bundles = findBundleGroups(edges, opts.bundleThreshold);
    const bundledEdgeIds = new Set<string>();

    // Process bundles first
    for (const bundle of bundles) {
      for (const fromId of bundle.sourceNodes) {
        const edge = edges.find(e => e.from === fromId && e.to === bundle.targetNode);
        if (edge) bundledEdgeIds.add(edge.id);
      }

      // Build trunk path
      const targetNode = nodePositions.get(bundle.targetNode);
      if (!targetNode) continue;

      // Route each source to the bundle exit point
      const bundlePaths: string[] = [];
      const crossingPoints: Map<string, number[]> = new Map();

      for (let i = 0; i < bundle.sourceNodes.length; i++) {
        const fromId = bundle.sourceNodes[i];
        const sourceNode = nodePositions.get(fromId);
        const edge = edges.find(e => e.from === fromId && e.to === bundle.targetNode);
        if (!sourceNode || !edge) continue;

        // Offset the bundle exit point for each source
        const offset = (i - (bundle.sourceNodes.length - 1) / 2) * opts.bundleSpread;
        const path = buildBundledPath(
          sourceNode,
          targetNode,
          offset,
          opts.cornerRadius
        );

        paths.set(edge.id, path);
        crossingPoints.set(edge.id, []);
        bundlePaths.push(path);
      }
    }

    // Process non-bundled edges
    for (const edge of edges) {
      if (bundledEdgeIds.has(edge.id)) continue;

      const sourceNode = nodePositions.get(edge.from);
      const targetNode = nodePositions.get(edge.to);
      if (!sourceNode || !targetNode) continue;

      const path = buildSmoothstepPath(sourceNode, targetNode, 0, opts.cornerRadius);
      paths.set(edge.id, path);
    }
  } else {
    // No bundling - simple orthogonal routing
    for (const edge of edges) {
      const sourceNode = nodePositions.get(edge.from);
      const targetNode = nodePositions.get(edge.to);
      if (!sourceNode || !targetNode) continue;

      const path = buildSmoothstepPath(sourceNode, targetNode, 0, opts.cornerRadius);
      paths.set(edge.id, path);
    }
  }

  // Find crossings and insert jump arcs
  const pathList = Array.from(paths.entries()).map(([id, path]) => ({ id, path }));
  const crossings = findPathCrossings(pathList);

  for (const [edgeId, path] of paths.entries()) {
    const edgeCrossings = crossings.get(edgeId) ?? [];
    const finalPath = edgeCrossings.length > 0
      ? insertJumpArcs(path, edgeCrossings, opts.jumpArcRadius)
      : path;

    const edge = edges.find(e => e.id === edgeId)!;

    routes.set(edgeId, {
      id: edgeId,
      path: finalPath,
      zIndex: computeZIndex(edge, crossings),
      crossings: edgeCrossings,
      fromId: edge.from,
      toId: edge.to,
    });
  }

  return routes;
}

/**
 * Find groups of edges that share a common target (bundling candidates).
 */
function findBundleGroups(
  edges: Array<{ id: string; from: string; to: string }>,
  threshold: number
): BundleGroup[] {
  const bundles: BundleGroup[] = [];

  // Group edges by target
  const byTarget = new Map<string, string[]>();
  for (const edge of edges) {
    const sources = byTarget.get(edge.to) ?? [];
    sources.push(edge.from);
    byTarget.set(edge.to, sources);
  }

  for (const [targetNode, sourceNodes] of byTarget.entries()) {
    if (sourceNodes.length >= threshold) {
      bundles.push({
        id: `bundle-${targetNode}`,
        sourceNodes,
        targetNode,
        bundleExitPoint: { x: 0, y: 0 }, // Will be computed during routing
        trunkPath: "", // Will be computed during routing
      });
    }
  }

  return bundles;
}

/**
 * Build a smoothstep path from source to target with bundle offset.
 */
function buildSmoothstepPath(
  source: PositionedNode,
  target: PositionedNode,
  bundleOffset: number,
  cornerRadius: number
): string {
  const sCenter = centerOf(source);
  const tCenter = centerOf(target);

  const sw = source.w ?? NODE_W;
  const sh = source.h ?? NODE_H;
  const tw = target.w ?? NODE_W;
  const th = target.h ?? NODE_H;

  const dx = tCenter.x - sCenter.x;
  const dy = tCenter.y - sCenter.y;

  // Determine exit/entry points
  // For top-to-bottom flow (dy > 0): exit bottom of source, enter top of target
  // For bottom-to-top flow (dy < 0): exit top of source, enter bottom of target
  // For left-to-right flow (dx > 0): exit right of source, enter left of target
  // For right-to-left flow (dx < 0): exit left of source, enter right of target

  const isVertical = Math.abs(dy) >= Math.abs(dx);

  let sx: number, sy: number, tx: number, ty: number;

  if (isVertical) {
    if (dy >= 0) {
      // Downward: exit bottom of source, enter top of target
      sx = sCenter.x + bundleOffset;
      sy = source.y + sh;
      tx = tCenter.x + bundleOffset;
      ty = target.y;
    } else {
      // Upward: exit top of source, enter bottom of target
      sx = sCenter.x + bundleOffset;
      sy = source.y;
      tx = tCenter.x + bundleOffset;
      ty = target.y + th;
    }
  } else {
    if (dx >= 0) {
      // Rightward: exit right of source, enter left of target
      sx = source.x + sw;
      sy = sCenter.y + bundleOffset;
      tx = target.x;
      ty = tCenter.y + bundleOffset;
    } else {
      // Leftward: exit left of source, enter right of target
      sx = source.x;
      sy = sCenter.y + bundleOffset;
      tx = target.x + tw;
      ty = tCenter.y + bundleOffset;
    }
  }

  return buildOrthogonalPath(sx, sy, tx, ty, isVertical, cornerRadius);
}

/**
 * Build a bundled path that joins a common trunk.
 */
function buildBundledPath(
  source: PositionedNode,
  target: PositionedNode,
  offset: number,
  cornerRadius: number
): string {
  const sCenter = centerOf(source);
  const tCenter = centerOf(target);

  const sw = source.w ?? NODE_W;
  const sh = source.h ?? NODE_H;
  const tw = target.w ?? NODE_W;
  const th = target.h ?? NODE_H;

  const dy = tCenter.y - sCenter.y;
  const isVertical = Math.abs(dy) >= Math.abs(tCenter.x - sCenter.x);

  let sx: number, sy: number, tx: number, ty: number;

  if (isVertical) {
    if (dy >= 0) {
      sx = sCenter.x + offset;
      sy = source.y + sh;
      tx = tCenter.x + offset;
      ty = target.y;
    } else {
      sx = sCenter.x + offset;
      sy = source.y;
      tx = tCenter.x + offset;
      ty = target.y + th;
    }
  } else {
    const dx = tCenter.x - sCenter.x;
    if (dx >= 0) {
      sx = source.x + sw;
      sy = sCenter.y + offset;
      tx = target.x;
      ty = tCenter.y + offset;
    } else {
      sx = source.x;
      sy = sCenter.y + offset;
      tx = target.x + tw;
      ty = tCenter.y + offset;
    }
  }

  return buildOrthogonalPath(sx, sy, tx, ty, isVertical, cornerRadius);
}

/**
 * Build an orthogonal (smoothstep) path between two points.
 * Uses H → turn → V → turn → H pattern or V → turn → H → turn → V.
 */
function buildOrthogonalPath(
  x1: number, y1: number,
  x2: number, y2: number,
  isVertical: boolean,
  r: number
): string {
  // Straight line shortcuts
  if (Math.abs(x1 - x2) < 2) return `M ${x1} ${y1} V ${y2}`;
  if (Math.abs(y1 - y2) < 2) return `M ${x1} ${y1} H ${x2}`;

  const rClamped = Math.max(0, Math.min(r, Math.abs(x2 - x1) / 2 - 1, Math.abs(y2 - y1) / 2 - 1));

  if (isVertical) {
    // V → H → V: exit vertically, horizontal midsection, enter vertically
    const midY = (y1 + y2) / 2;
    if (rClamped < 1) {
      return `M ${x1} ${y1} V ${midY} H ${x2} V ${y2}`;
    }
    const signH = x2 >= x1 ? 1 : -1;
    return [
      `M ${x1} ${y1}`,
      `V ${midY - rClamped}`,
      `Q ${x1} ${midY} ${x1 + signH * rClamped} ${midY}`,
      `H ${x2 - signH * rClamped}`,
      `Q ${x2} ${midY} ${x2} ${midY + rClamped}`,
      `V ${y2}`,
    ].join(" ");
  } else {
    // H → V → H: exit horizontally, vertical midsection, enter horizontally
    const midX = (x1 + x2) / 2;
    if (rClamped < 1) {
      return `M ${x1} ${y1} H ${midX} V ${y2} H ${x2}`;
    }
    const signV = y2 >= y1 ? 1 : -1;
    return [
      `M ${x1} ${y1}`,
      `H ${midX - rClamped}`,
      `Q ${midX} ${y1} ${midX} ${y1 + signV * rClamped}`,
      `V ${y2 - signV * rClamped}`,
      `Q ${midX} ${y2} ${midX + rClamped} ${y2}`,
      `H ${x2}`,
    ].join(" ");
  }
}

/**
 * Parse an orthogonal SVG path into H/V line segments.
 */
export interface OrthoSegment {
  x1: number; y1: number;
  x2: number; y2: number;
  isH: boolean;
}

function extractOrthoSegments(path: string): OrthoSegment[] {
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
      // Skip bezier arcs
      cx = ns[2]; cy = ns[3];
    }
  }

  return segs;
}

/**
 * Find all crossings between orthogonal paths.
 */
function findPathCrossings(
  paths: Array<{ id: string; path: string }>
): Map<string, number[]> {
  const result = new Map<string, number[]>();

  const byId = new Map<string, OrthoSegment[]>();
  for (const { id, path } of paths) {
    byId.set(id, extractOrthoSegments(path));
  }

  const ids = paths.map(p => p.id);

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

          // Genuine crossing (not T-intersection)
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

  // Sort and dedupe
  for (const [id, xs] of result) {
    result.set(id, [...new Set(xs)].sort((a, b) => a - b));
  }

  return result;
}

/**
 * Insert upward jump arcs at crossing positions.
 */
function insertJumpArcs(path: string, crossings: number[], R: number): string {
  if (crossings.length === 0) return path;

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
      const inRange = crossings.filter(
        kx => dir === 1
          ? (kx > cx + R + 1 && kx < tx - R - 1)
          : (kx < cx - R - 1 && kx > tx + R + 1)
      ).sort((a, b) => dir * (a - b));

      if (inRange.length === 0) {
        parts.push(`H ${tx}`);
      } else {
        for (const kx of inRange) {
          parts.push(`H ${kx - dir * R}`);
          // Counterclockwise arc bumps upward
          parts.push(`a ${R} ${R} 0 0 ${dir === 1 ? 0 : 1} ${dir * 2 * R} 0`);
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

/**
 * Compute z-index for an edge based on crossing count and depth.
 * Edges with more crossings should be rendered first (lower z-index).
 */
function computeZIndex(
  edge: { id: string; from: string; to: string },
  crossings: Map<string, number[]>
): number {
  const crossingCount = crossings.get(edge.id)?.length ?? 0;
  // Lower z-index for edges with crossings (render them first)
  // Higher z-index for cleaner edges (render them on top)
  return crossingCount * 10;
}

/**
 * Assign z-indices to ensure edges render behind nodes.
 * Minimum z-index is 0 (edges), nodes start at 100.
 */
export function computeEdgeZIndex(edgeZ: number): number {
  return Math.min(99, edgeZ);
}
