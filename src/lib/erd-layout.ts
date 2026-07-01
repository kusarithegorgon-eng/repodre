/**
 * ERD Layout Engine — Relational Grid + Orthogonal Routing
 *
 * Unlike the App Journey viewport (left-to-right timeline), the ERD viewport
 * arranges table nodes in a multi-directional relational grid. Tables are
 * placed on a wrapped grid (like an auto-flow chart) and FK connections
 * route orthogonally (Manhattan-style) between the specific row coordinates
 * of the foreign-key column on each table.
 *
 * Output: positioned table nodes + orthogonal edge paths with Crow's Foot
 * marker anchor points.
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
}

export interface Point {
  x: number;
  y: number;
}

export interface LaidOutErd {
  tables: ErdTableNode[];
  edges: ErdEdge[];
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

  // Route edges orthogonally between FK column rows
  const routedEdges: ErdEdge[] = edges
    .map((e) => {
      const fromTable = tableById.get(e.fromTableId);
      const toTable = tableById.get(e.toTableId);
      if (!fromTable || !toTable) return null;

      const fromAnchor = columnAnchor(fromTable, e.fromColumn, toTable);
      const toAnchor = columnAnchor(toTable, e.toColumn, fromTable);

      const path = orthogonalPath(fromAnchor, toAnchor, fromTable, toTable);

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
      };
    })
    .filter((e): e is ErdEdge => e !== null);

  return { tables: positioned, edges: routedEdges };
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

/**
 * Build an orthogonal (Manhattan) SVG path between two points, routing
 * around the source and target table boxes.
 *
 * Strategy: exit the source horizontally, travel to a midpoint column,
 * turn vertically, then enter the target horizontally.
 */
function orthogonalPath(
  from: Point,
  to: Point,
  fromTable: ErdTableNode,
  toTable: ErdTableNode
): string {
  // If both anchors are on the same side (both left or both right), route
  // through a midpoint; otherwise use a simple L or Z bend.
  const fromIsRight = from.x > fromTable.x + fromTable.width / 2;
  const toIsRight = to.x > toTable.x + toTable.width / 2;

  const exitGap = 24; // how far the path exits horizontally before turning

  const p1x = from.x + (fromIsRight ? exitGap : -exitGap);
  const p2x = to.x + (toIsRight ? exitGap : -exitGap);

  const midX = (p1x + p2x) / 2;

  // Build the path: M from -> H p1x -> V midY -> H p2x -> V to.y -> H to.x
  // But we need to handle the vertical segment at midX.
  const points: Point[] = [
    from,
    { x: p1x, y: from.y },
    { x: midX, y: from.y },
    { x: midX, y: to.y },
    { x: p2x, y: to.y },
    to,
  ];

  // Simplify collinear points for cleaner SVG
  const simplified = simplifyPath(points);
  return toSvgPath(simplified);
}

function simplifyPath(points: Point[]): Point[] {
  if (points.length <= 2) return points;
  const out: Point[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const prev = out[out.length - 1];
    const cur = points[i];
    const next = points[i + 1];
    if (next && isCollinear(prev, cur, next)) {
      // skip cur — it's on the line from prev to next
      continue;
    }
    out.push(cur);
  }
  return out;
}

function isCollinear(a: Point, b: Point, c: Point): boolean {
  // horizontal collinear
  if (a.y === b.y && b.y === c.y) return true;
  // vertical collinear
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

/**
 * Compute the row index of a column in a table (for highlight/scroll).
 */
export function columnRowIndex(table: ErdTableNode, columnName: string): number {
  const idx = table.columns.findIndex((c) => c.name === columnName);
  return idx === -1 ? 0 : idx;
}
