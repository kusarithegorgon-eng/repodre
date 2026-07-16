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

      const path = smoothstepPath(fromAnchor, toAnchor, fromTable, toTable);

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
 * Build a smoothstep (rounded orthogonal) SVG path between two anchor points.
 * Uses quadratic Bezier curves at corners instead of sharp 90° turns,
 * which visually separates overlapping lines and makes them easier to follow.
 */
function smoothstepPath(from: Point, to: Point, fromTable: ErdTableNode, toTable: ErdTableNode): string {
  const fromIsRight = from.x > fromTable.x + fromTable.width / 2;
  const toIsRight = to.x > toTable.x + toTable.width / 2;

  const exitGap = 24;
  const p1x = from.x + (fromIsRight ? exitGap : -exitGap);
  const p2x = to.x + (toIsRight ? exitGap : -exitGap);
  const midX = (p1x + p2x) / 2;

  const r = Math.min(12, Math.abs(midX - p1x) / 2, Math.abs(p2x - midX) / 2);
  const fromSx = fromIsRight ? 1 : -1;
  const toSx = toIsRight ? 1 : -1;

  const parts: string[] = [`M ${from.x} ${from.y}`];
  parts.push(`H ${p1x}`);
  if (Math.abs(midX - p1x) > r * 2) {
    parts.push(`Q ${p1x + fromSx * r} ${from.y} ${p1x + fromSx * r} ${from.y + Math.sign(to.y - from.y) * r}`);
    parts.push(`V ${to.y - Math.sign(to.y - from.y) * r}`);
    parts.push(`Q ${p1x + fromSx * r} ${to.y} ${midX} ${to.y}`);
    parts.push(`H ${p2x - toSx * r}`);
    parts.push(`Q ${p2x} ${to.y} ${p2x} ${to.y}`);
  } else {
    parts.push(`L ${midX} ${from.y}`);
    parts.push(`L ${midX} ${to.y}`);
    parts.push(`L ${p2x} ${to.y}`);
  }
  parts.push(`H ${to.x}`);
  return parts.join(" ");
}

/**
 * Compute the row index of a column in a table (for highlight/scroll).
 */
export function columnRowIndex(table: ErdTableNode, columnName: string): number {
  const idx = table.columns.findIndex((c) => c.name === columnName);
  return idx === -1 ? 0 : idx;
}
