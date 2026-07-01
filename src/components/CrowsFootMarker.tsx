/**
 * CrowsFootMarker — SVG marker definitions for ERD cardinality notation.
 *
 * Renders two marker variants into a shared <defs>:
 *   - one-to-one  : a single bar (||) on each end
 *   - one-to-many : a bar on the "one" end, a three-pronged fork on the "many" end
 *
 * The markers are oriented automatically by SVG based on the path direction,
 * so we define a "one" marker and a "many" marker and reference them by id
 * from the edge paths.
 */

import type { Cardinality } from "@/lib/sql-tokenizer";

interface CrowsFootMarkerProps {
  /** unique id prefix to avoid collisions when multiple SVGs are on the page */
  idPrefix?: string;
}

export function CrowsFootMarker({ idPrefix = "erd" }: CrowsFootMarkerProps) {
  const oneId = `${idPrefix}-marker-one`;
  const manyId = `${idPrefix}-marker-many`;

  return (
    <defs>
      {/* "One" marker: a single perpendicular bar */}
      <marker
        id={oneId}
        viewBox="0 0 12 12"
        refX="10"
        refY="6"
        markerWidth="12"
        markerHeight="12"
        orient="auto-start-reverse"
        markerUnits="userSpaceOnUse"
      >
        <line
          x1="9"
          y1="1"
          x2="9"
          y2="11"
          stroke="var(--teal)"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </marker>

      {/* "Many" marker: a three-pronged crow's foot fork */}
      <marker
        id={manyId}
        viewBox="0 0 12 12"
        refX="2"
        refY="6"
        markerWidth="14"
        markerHeight="14"
        orient="auto-start-reverse"
        markerUnits="userSpaceOnUse"
      >
        <path
          d="M 2 6 L 11 1 M 2 6 L 11 6 M 2 6 L 11 11"
          stroke="var(--teal)"
          strokeWidth="1.8"
          fill="none"
          strokeLinecap="round"
        />
      </marker>
    </defs>
  );
}

/**
 * Resolve which marker ids to attach to the start/end of an edge based on
 * its cardinality.
 *   1:1 — single bar (||) on each end
 *   1:N — bar on the "one" end, three-pronged fork on the "many" end
 *   M:N — three-pronged fork on both ends
 */
export function markerForCardinality(
  cardinality: Cardinality,
  idPrefix = "erd"
): { markerStart: string; markerEnd: string } {
  const one = `url(#${idPrefix}-marker-one)`;
  const many = `url(#${idPrefix}-marker-many)`;
  if (cardinality === "one-to-one") {
    return { markerStart: one, markerEnd: one };
  }
  if (cardinality === "many-to-many") {
    return { markerStart: many, markerEnd: many };
  }
  // one-to-many: source = one bar, target = crow's foot
  return { markerStart: one, markerEnd: many };
}
