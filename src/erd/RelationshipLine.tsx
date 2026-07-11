import type { ErdRelationship, ErdTable } from "./data";

interface Props {
  rel: ErdRelationship;
  fromTable: ErdTable;
  toTable: ErdTable;
  hovered: boolean;
  selected: boolean;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
}

const HEADER_H = 36;
const ROW_H = 30;

function fieldY(table: ErdTable, fieldName: string) {
  const idx = table.fields.findIndex((f) => f.name === fieldName);
  return table.y + HEADER_H + idx * ROW_H + ROW_H / 2;
}

function side(table: ErdTable, other: ErdTable) {
  // Anchor on the edge facing the other table.
  const cx = table.x + table.width / 2;
  const ocx = other.x + other.width / 2;
  return cx <= ocx ? "right" : "left";
}

function anchor(table: ErdTable, fieldName: string, s: "left" | "right") {
  const y = fieldY(table, fieldName);
  const x = s === "right" ? table.x + table.width : table.x;
  return { x, y };
}

function crowPath(x: number, y: number, dir: 1 | -1) {
  const len = 12;
  const spread = 7;
  return `M ${x} ${y} L ${x + dir * len} ${y - spread} M ${x} ${y} L ${
    x + dir * len
  } ${y} M ${x} ${y} L ${x + dir * len} ${y + spread}`;
}

function singlePath(x: number, y: number, dir: 1 | -1) {
  const len = 10;
  return `M ${x} ${y} L ${x + dir * len} ${y - 6} L ${x + dir * len} ${
    y + 6
  } Z`;
}

export function RelationshipLine({
  rel,
  fromTable,
  toTable,
  hovered,
  selected,
  onHover,
  onSelect,
}: Props) {
  const fromSide = side(fromTable, toTable);
  const toSide = side(toTable, fromTable);
  const a = anchor(fromTable, rel.fromField, fromSide);
  const b = anchor(toTable, rel.toField, toSide);

  const dirA = fromSide === "right" ? 1 : -1;
  const dirB = toSide === "right" ? 1 : -1;

  const dx = Math.abs(b.x - a.x) / 2;
  const c1x = a.x + dirA * dx;
  const c2x = b.x + dirB * dx;
  const d = `M ${a.x} ${a.y} C ${c1x} ${a.y}, ${c2x} ${b.y}, ${b.x} ${b.y}`;

  const stroke = selected
    ? "#2563eb"
    : hovered
      ? "#3b82f6"
      : "#818ea4";

  const midX = (a.x + b.x) / 2;
  const midY = (a.y + b.y) / 2;

  return (
    <g>
      {/* invisible fat hit area */}
      <path
        d={d}
        fill="none"
        stroke="transparent"
        strokeWidth={16}
        style={{ cursor: "pointer" }}
        onMouseEnter={() => onHover(rel.id)}
        onMouseLeave={() => onHover(null)}
        onClick={() => onSelect(rel.id)}
      />
      {/* visible line */}
      <path
        className="rel-line"
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth={selected ? 2.5 : 1.8}
        markerEnd="none"
        style={{ pointerEvents: "none" }}
      />
      {/* endpoint markers */}
      {/* "one" side — short bar */}
      <line
        x1={a.x + dirA * 6}
        y1={a.y - 7}
        x2={a.x + dirA * 6}
        y2={a.y + 7}
        stroke={stroke}
        strokeWidth={2}
        style={{ pointerEvents: "none" }}
      />
      {/* far endpoint depends on cardinality */}
      {rel.cardinality === "1:1" && (
        <line
          x1={b.x + dirB * 6}
          y1={b.y - 7}
          x2={b.x + dirB * 6}
          y2={b.y + 7}
          stroke={stroke}
          strokeWidth={2}
          style={{ pointerEvents: "none" }}
        />
      )}
      {rel.cardinality === "1:M" && (
        <path
          d={crowPath(b.x, b.y, dirB)}
          fill="none"
          stroke={stroke}
          strokeWidth={2}
          style={{ pointerEvents: "none" }}
        />
      )}
      {rel.cardinality === "M:N" && (
        <>
          <path
            d={crowPath(a.x, a.y, dirA)}
            fill="none"
            stroke={stroke}
            strokeWidth={2}
            style={{ pointerEvents: "none" }}
          />
          <path
            d={crowPath(b.x, b.y, dirB)}
            fill="none"
            stroke={stroke}
            strokeWidth={2}
            style={{ pointerEvents: "none" }}
          />
        </>
      )}

      {/* hover tooltip */}
      {hovered && (
        <g className="tooltip-enter" style={{ pointerEvents: "none" }}>
          <rect
            x={midX - 92}
            y={midY - 16}
            width={184}
            height={28}
            rx={6}
            fill="#1e2430"
            opacity={0.94}
          />
          <text
            x={midX}
            y={midY + 4}
            textAnchor="middle"
            fill="white"
            fontSize={12}
            fontFamily="Inter, sans-serif"
            fontWeight={500}
          >
            {rel.label}
          </text>
        </g>
      )}
    </g>
  );
}

export { singlePath };
