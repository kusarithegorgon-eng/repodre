/**
 * ERD Layout Engine — Relational Grid + Obstacle-Aware Manhattan Routing
 *
 * Unlike the App Journey viewport (left-to-right timeline), the ERD viewport
 * arranges table nodes in a multi-directional relational grid. Tables are
 * placed on a wrapped grid (like an auto-flow chart) and FK connections
 * route orthogonally (Manhattan-style) between the specific row coordinates
 * of the foreign-key column on each table.
 *
 * Features:
 * - Obstacle-aware Manhattan routing: vertical corridors are chosen to
 *   avoid intersecting other table boxes
 * - Hop-arc injection at line crossings (visual "bridge" bumps)
 * - Subgraph grouping: tables connected by FKs are clustered into labeled
 *   containers to reduce visual clutter
 * - Segmented edge label midpoints for "Parent → Child" annotations
 */

import type { Cardinality } from "./sql-tokenizer";

// ─── Constants ──────────────────────────────────────────────────────────────

export const ERD_TABLE_WIDTH = 240;
export const ERD_HEADER_HEIGHT = 36;
export const ERD_ROW_HEIGHT = 28;
export const ERD_GRID_GAP_X = 80;
export const ERD_GRID_GAP_Y = 80;
export const ERD_START_X = 60;
export const ERD_START_Y = 60;
export const ERD_MAX_COLS = 3; // tables per row before wrapping

const ROUTE_PAD = 20; // clearance around obstacles when routing
const HOP_ARC_RADIUS = 5;

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ErdColumnRow {
  name: string;
  type: string;
  pk: boolean;
  fk: boolean;
  unique: boolean;
  nullable: boolean;
}

export interface ErdTableNode {
  id: string;
  name: string;
  columns: ErdColumnRow[];
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ErdEdge {
  id: string;
  fromTableId: string;
  toTableId: string;
  fromColumn: string;
  toColumn: string;
  cardinality: Cardinality;
  /** orthogonal SVG path */
  path: string;
  /** marker anchor on the source side (for Crow's Foot) */
  fromMarker: Point;
  /** marker anchor on the target side */
  toMarker: Point;
  /** midpoint for label placement */
  labelPoint: Point;
}

export interface Point {
  x: number;
  y: number;
}

export interface ErdSubgraph {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  tableIds: string[];
}

export interface LaidOutErd {
  tables: ErdTableNode[];
  edges: ErdEdge[];
  subgraphs: ErdSubgraph[];
}

// ─── Layout ─────────────────────────────────────────────────────────────────

/**
 * Compute the height of a table node from its column count.
 */
export function tableHeight(columnCount: number): number {
  return ERD_HEADER_HEIGHT + Math.max(1, columnCount) * ERD_ROW_HEIGHT + 8;
}

/**
 * Lay out tables on a wrapped grid (3 columns per row, flowing top-to-bottom).
 * Tables are ordered by name for stable output.
 */
export function layoutErd(
  tables: Array<{
    id: string;
    name: string;
    columns: ErdColumnRow[];
    x?: number;
    y?: number;
  }>,
  edges: Array<{
    id: string;
    fromTableId: string;
    toTableId: string;
    fromColumn: string;
    toColumn: string;
    cardinality: Cardinality;
  }>
): LaidOutErd {
  // Sort tables by name for deterministic grid placement (used only for
  // tables that don't have a live position yet)
  const sorted = [...tables].sort((a, b) => a.name.localeCompare(b.name));

  const positioned: ErdTableNode[] = sorted.map((t, i) => {
    const col = i % ERD_MAX_COLS;
    const row = Math.floor(i / ERD_MAX_COLS);
    const width = ERD_TABLE_WIDTH;
    const height = tableHeight(t.columns.length);
    return {
      id: t.id,
      name: t.name,
      columns: t.columns,
      x: t.x ?? ERD_START_X + col * (ERD_TABLE_WIDTH + ERD_GRID_GAP_X),
      y: t.y ?? ERD_START_Y + row * (height + ERD_GRID_GAP_Y),
      width,
      height,
    };
  });

  const tableById = new Map(positioned.map((t) => [t.id, t]));

  // Route edges with obstacle-aware Manhattan routing
  const routedEdges: ErdEdge[] = edges
    .map((e) => {
      const fromTable = tableById.get(e.fromTableId);
      const toTable = tableById.get(e.toTableId);
      if (!fromTable || !toTable) return null;

      const fromAnchor = columnAnchor(fromTable, e.fromColumn, toTable);
      const toAnchor = columnAnchor(toTable, e.toColumn, fromTable);

      const path = manhattanRoute(fromAnchor, toAnchor, fromTable, toTable, positioned);

      const labelPoint = {
        x: (fromAnchor.x + toAnchor.x) / 2,
        y: (fromAnchor.y + toAnchor.y) / 2,
      };

      return {
        id: e.id,
        fromTableId: e.fromTableId,
        toTableId: e.toTableId,
        fromColumn: e.fromColumn,
        toColumn: e.toColumn,
        cardinality: e.cardinality,
        path,
        fromMarker: fromAnchor,
        toMarker: toAnchor,
        labelPoint,
      };
    })
    .filter((e): e is ErdEdge => e !== null);

  // Inject hop arcs at crossings
  const crossingMap = findErdCrossings(routedEdges);
  const withHops = routedEdges.map((e) => {
    const xs = crossingMap.get(e.id);
    if (!xs || xs.length === 0) return e;
    return { ...e, path: insertHopArcs(e.path, xs) };
  });

  // Compute subgraphs (FK-connected clusters)
  const subgraphs = computeSubgraphs(positioned, edges);

  return { tables: positioned, edges: withHops, subgraphs };
}

/**
 * Compute the canvas-space anchor point for a specific column row on a table.
 * The anchor sits on the side of the table closest to the other table.
 */
function columnAnchor(
  table: ErdTableNode,
  columnName: string,
  otherTable: ErdTableNode
): Point {
  const colIndex = table.columns.findIndex((c) => c.name === columnName);
  const rowIndex = colIndex === -1 ? 0 : colIndex;

  // y = header + row center
  const y = table.y + ERD_HEADER_HEIGHT + rowIndex * ERD_ROW_HEIGHT + ERD_ROW_HEIGHT / 2;

  // x: pick the side of the table closest to the other table's center
  const myCenterX = table.x + table.width / 2;
  const otherCenterX = otherTable.x + otherTable.width / 2;
  const x = otherCenterX <= myCenterX ? table.x : table.x + table.width;

  return { x, y };
}

// ─── Obstacle-Aware Manhattan Routing ───────────────────────────────────────

/**
 * Build an orthogonal (Manhattan) SVG path between two anchor points, routing
 * around other table boxes.
 *
 * Strategy:
 * 1. Exit the source horizontally by a short gap.
 * 2. Find a vertical corridor at midpoint X that doesn't intersect any
 *    obstacle table. If blocked, scan left/right for a clear corridor.
 * 3. If no clear corridor exists, add a second bend to detour around.
 * 4. Enter the target horizontally.
 */
function manhattanRoute(
  from: Point,
  to: Point,
  fromTable: ErdTableNode,
  toTable: ErdTableNode,
  allTables: ErdTableNode[]
): string {
  const fromIsRight = from.x > fromTable.x + fromTable.width / 2;
  const toIsRight = to.x > toTable.x + toTable.width / 2;

  const exitGap = 24;

  const p1x = from.x + (fromIsRight ? exitGap : -exitGap);
  const p2x = to.x + (toIsRight ? exitGap : -exitGap);

  // Obstacles: all tables except source and target
  const obstacles = allTables.filter(
    (t) => t.id !== fromTable.id && t.id !== toTable.id
  );

  // Try the midpoint corridor first
  const candidates = [Math.round((p1x + p2x) / 2)];

  // If blocked, scan outward from midpoint for a clear vertical corridor
  const step = 40;
  for (let i = 1; i <= 8; i++) {
    candidates.push(Math.round((p1x + p2x) / 2) + i * step);
    candidates.push(Math.round((p1x + p2x) / 2) - i * step);
  }

  // Find the first corridor that doesn't intersect any obstacle
  let bestMidX = candidates[0];
  for (const midX of candidates) {
    if (corridorIsClear(midX, from.y, to.y, obstacles)) {
      bestMidX = midX;
      break;
    }
  }

  // If still blocked, use a detour with two vertical segments
  const midBlocked = !corridorIsClear(bestMidX, from.y, to.y, obstacles);

  let points: Point[];
  if (!midBlocked) {
    points = [
      from,
      { x: p1x, y: from.y },
      { x: bestMidX, y: from.y },
      { x: bestMidX, y: to.y },
      { x: p2x, y: to.y },
      to,
    ];
  } else {
    // Detour: route above or below the obstacle cluster
    const allYs = obstacles.map((o) => ({ top: o.y, bottom: o.y + o.height }));
    const minY = Math.min(from.y, to.y, ...allYs.map((y) => y.top));
    const maxY = Math.max(from.y, to.y, ...allYs.map((y) => y.bottom));
    const detourY = (from.y + to.y) / 2 < (minY + maxY) / 2 ? minY - 60 : maxY + 60;

    const detourX = bestMidX;
    points = [
      from,
      { x: p1x, y: from.y },
      { x: detourX, y: from.y },
      { x: detourX, y: detourY },
      { x: p2x, y: detourY },
      { x: p2x, y: to.y },
      to,
    ];
  }

  const simplified = simplifyPath(points);
  return toSvgPath(simplified);
}

/**
 * Check if a vertical corridor at x from y1 to y2 clears all obstacle boxes.
 */
function corridorIsClear(
  x: number,
  y1: number,
  y2: number,
  obstacles: ErdTableNode[]
): boolean {
  const minY = Math.min(y1, y2);
  const maxY = Math.max(y1, y2);
  for (const obs of obstacles) {
    if (
      x > obs.x - ROUTE_PAD &&
      x < obs.x + obs.width + ROUTE_PAD &&
      maxY > obs.y - ROUTE_PAD &&
      minY < obs.y + obs.height + ROUTE_PAD
    ) {
      return false;
    }
  }
  return true;
}

function simplifyPath(points: Point[]): Point[] {
  if (points.length <= 2) return points;
  const out: Point[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const prev = out[out.length - 1];
    const cur = points[i];
    const next = points[i + 1];
    if (next && isCollinear(prev, cur, next)) {
      continue;
    }
    out.push(cur);
  }
  return out;
}

function isCollinear(a: Point, b: Point, c: Point): boolean {
  if (a.y === b.y && b.y === c.y) return true;
  if (a.x === b.x && b.x === c.x) return true;
  return false;
}

function toSvgPath(points: Point[]): string {
  if (points.length === 0) return "";
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i].x} ${points[i].y}`;
  }
  return d;
}

// ─── Crossing Detection & Hop Arcs ──────────────────────────────────────────

interface OrthoSeg {
  x1: number; y1: number;
  x2: number; y2: number;
  isH: boolean;
}

function extractSegments(path: string): OrthoSeg[] {
  const segs: OrthoSeg[] = [];
  let cx = 0, cy = 0;
  const re = /([MLHV])\s*([-\d. ,]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(path)) !== null) {
    const cmd = m[1];
    const ns = m[2].trim().split(/[\s,]+/).map(Number).filter(n => !isNaN(n));
    if (cmd === "M") {
      cx = ns[0]; cy = ns[1];
    } else if (cmd === "L") {
      segs.push({ x1: cx, y1: cy, x2: ns[0], y2: ns[1], isH: Math.abs(cy - ns[1]) < 0.5 });
      cx = ns[0]; cy = ns[1];
    } else if (cmd === "H") {
      segs.push({ x1: cx, y1: cy, x2: ns[0], y2: cy, isH: true });
      cx = ns[0];
    } else if (cmd === "V") {
      segs.push({ x1: cx, y1: cy, x2: cx, y2: ns[0], isH: false });
      cy = ns[0];
    }
  }
  return segs;
}

function findErdCrossings(edges: ErdEdge[]): Map<string, number[]> {
  const result = new Map<string, number[]>();
  const byId = new Map<string, OrthoSeg[]>();
  for (const e of edges) byId.set(e.id, extractSegments(e.path));

  for (let i = 0; i < edges.length; i++) {
    const idA = edges[i].id;
    const hSegs = (byId.get(idA) ?? []).filter(s => s.isH);
    if (hSegs.length === 0) continue;

    for (let j = 0; j < edges.length; j++) {
      if (i === j) continue;
      const idB = edges[j].id;
      const vSegs = (byId.get(idB) ?? []).filter(s => !s.isH);

      for (const h of hSegs) {
        const hMinX = Math.min(h.x1, h.x2);
        const hMaxX = Math.max(h.x1, h.x2);
        for (const v of vSegs) {
          const vMinY = Math.min(v.y1, v.y2);
          const vMaxY = Math.max(v.y1, v.y2);
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

  for (const [id, xs] of result) result.set(id, [...new Set(xs)].sort((a, b) => a - b));
  return result;
}

function insertHopArcs(path: string, crossingXs: number[], R = HOP_ARC_RADIUS): string {
  if (crossingXs.length === 0) return path;
  let cx = 0;
  const parts: string[] = [];
  const re = /([MLHV])\s*([-\d. ,]+)/g;
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
        for (const kx of inRange) {
          parts.push(`H ${kx - dir * R}`);
          parts.push(`a ${R} ${R} 0 0 ${dir === 1 ? 0 : 1} ${dir * 2 * R} 0`);
        }
        parts.push(`H ${tx}`);
      }
      cx = tx;
    } else if (cmd === "L") {
      parts.push(`L ${ns[0]} ${ns[1]}`);
      cx = ns[0];
    } else if (cmd === "V") {
      parts.push(`V ${ns[0]}`);
    }
  }
  return parts.join(" ");
}

// ─── Subgraph Computation ───────────────────────────────────────────────────

/**
 * Group tables into subgraphs using union-find on FK edges.
 * Tables connected by foreign keys belong to the same cluster.
 * Singleton tables are not grouped (no container needed).
 */
function computeSubgraphs(
  tables: ErdTableNode[],
  edges: Array<{ fromTableId: string; toTableId: string }>
): ErdSubgraph[] {
  // Union-find
  const parent = new Map<string, string>();
  for (const t of tables) parent.set(t.id, t.id);

  const find = (id: string): string => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root)!;
    // Path compression
    let cur = id;
    while (parent.get(cur) !== root) {
      const next = parent.get(cur)!;
      parent.set(cur, root);
      cur = next;
    }
    return root;
  };

  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  for (const e of edges) {
    if (parent.has(e.fromTableId) && parent.has(e.toTableId)) {
      union(e.fromTableId, e.toTableId);
    }
  }

  // Group by root
  const groups = new Map<string, string[]>();
  for (const t of tables) {
    const root = find(t.id);
    const arr = groups.get(root) ?? [];
    arr.push(t.id);
    groups.set(root, arr);
  }

  // Only create subgraphs for clusters with 2+ tables
  const subgraphs: ErdSubgraph[] = [];
  let groupIdx = 0;
  for (const [root, tableIds] of groups) {
    if (tableIds.length < 2) continue;

    const groupTables = tableIds
      .map((id) => tables.find((t) => t.id === id)!)
      .filter(Boolean);

    if (groupTables.length === 0) continue;

    const minX = Math.min(...groupTables.map((t) => t.x));
    const minY = Math.min(...groupTables.map((t) => t.y));
    const maxX = Math.max(...groupTables.map((t) => t.x + t.width));
    const maxY = Math.max(...groupTables.map((t) => t.y + t.height));

    const pad = 24;
    const labelHeight = 28;

    // Derive a label from the shared naming prefix or use a generic name
    const names = groupTables.map((t) => t.name);
    const prefix = longestCommonPrefix(names);
    const label = prefix.length > 2
      ? `${prefix}* cluster`
      : `Group ${groupIdx + 1}`;

    subgraphs.push({
      id: `sg_${root}`,
      label,
      x: minX - pad,
      y: minY - pad - labelHeight,
      width: maxX - minX + pad * 2,
      height: maxY - minY + pad * 2 + labelHeight,
      tableIds,
    });
    groupIdx++;
  }

  return subgraphs;
}

function longestCommonPrefix(strings: string[]): string {
  if (strings.length === 0) return "";
  let prefix = strings[0];
  for (const s of strings) {
    while (!s.startsWith(prefix)) {
      prefix = prefix.slice(0, -1);
      if (prefix.length === 0) return "";
    }
  }
  return prefix;
}

/**
 * Compute the row index of a column in a table (for highlight/scroll).
 */
export function columnRowIndex(table: ErdTableNode, columnName: string): number {
  const idx = table.columns.findIndex((c) => c.name === columnName);
  return idx === -1 ? 0 : idx;
}
