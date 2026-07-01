/**
 * ErdCanvas — Database ERD viewport
 *
 * Renders the relational grid: dense entity cards (tables with column rows)
 * connected by orthogonal SVG paths with Crow's Foot cardinality markers.
 * Connections snap to the row height of the foreign-key column on each table.
 */

import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { EntityCard } from "./EntityCard";
import { CrowsFootMarker, markerForCardinality } from "./CrowsFootMarker";
import {
  layoutErd,
  type ErdTableNode,
  type ErdEdge,
  type LaidOutErd,
} from "@/lib/erd-layout";
import type { Node, Edge } from "@/lib/db-client";

interface ErdCanvasProps {
  nodes: Node[];
  edges: Edge[];
  selected: string | null;
  onSelect: (id: string | null) => void;
  onDragEnd: (id: string, x: number, y: number) => void;
  onDeleteNode?: (id: string) => void;
  zoom: number;
}

export function ErdCanvas({ nodes, edges, selected, onSelect, onDragEnd, onDeleteNode, zoom }: ErdCanvasProps) {
  // Filter to ERD table nodes only
  const tableNodes = nodes.filter((n) => n.workspace === "erd" && n.columns);

  // Build the layout input from the live node/edge state.
  // Pass live x/y so edges anchor on the actual (possibly dragged) positions.
  const laidOut: LaidOutErd = useMemo(() => {
    const tables = tableNodes.map((n) => ({
      id: n.id,
      name: n.tableName ?? n.label,
      columns: (n.columns ?? []).map((c) => ({
        name: c.name,
        type: c.type,
        pk: c.pk,
        fk: c.fk,
        unique: c.unique,
        nullable: c.nullable,
      })),
      x: n.x,
      y: n.y,
    }));

    const erdEdges = edges
      .filter((e) => e.cardinality && e.fromColumn && e.toColumn)
      .map((e) => ({
        id: e.id,
        fromTableId: e.from,
        toTableId: e.to,
        fromColumn: e.fromColumn!,
        toColumn: e.toColumn!,
        cardinality: e.cardinality!,
      }));

    return layoutErd(tables, erdEdges);
  }, [tableNodes, edges]);

  const tableById = new Map(laidOut.tables.map((t) => [t.id, t]));

  // Track which column is hovered (for highlight)
  const [hoveredColumn, setHoveredColumn] = useState<string | null>(null);

  // Drag state — delta-based positioning (same pattern as CanvasNode)
  const [dragId, setDragId] = useState<string | null>(null);
  const dragOrigin = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent, table: ErdTableNode) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      onSelect(table.id);
      setDragId(table.id);
      dragOrigin.current = {
        startX: e.clientX,
        startY: e.clientY,
        originX: table.x,
        originY: table.y,
      };
    },
    [onSelect]
  );

  useEffect(() => {
    if (!dragId) return;
    const onMove = (mv: MouseEvent) => {
      const origin = dragOrigin.current;
      if (!origin) return;
      const newX = origin.originX + (mv.clientX - origin.startX) / (zoom / 100);
      const newY = origin.originY + (mv.clientY - origin.startY) / (zoom / 100);
      onDragEnd(dragId, newX, newY);
    };
    const onUp = () => {
      setDragId(null);
      dragOrigin.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragId, zoom, onDragEnd]);

  if (tableNodes.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center text-center">
        <div className="max-w-sm">
          <div className="mb-3 flex h-14 w-14 mx-auto items-center justify-center rounded-full bg-surface border border-border">
            <svg viewBox="0 0 14 16" fill="none" className="h-7 w-7">
              <rect x="1" y="3" width="12" height="10" stroke="var(--muted-foreground)" strokeWidth="1.2" />
              <ellipse cx="7" cy="3" rx="6" ry="2.5" stroke="var(--muted-foreground)" strokeWidth="1.2" />
              <ellipse cx="7" cy="13" rx="6" ry="2.5" stroke="var(--muted-foreground)" strokeWidth="1.2" />
            </svg>
          </div>
          <p className="text-sm font-medium text-foreground">No tables yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Paste a DDL schema (PostgreSQL, MySQL, or SQLite) into the schema input
            to populate the ERD canvas.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="grid-canvas absolute inset-0 overflow-hidden"
      onClick={() => onSelect(null)}
    >
      <div
        className="relative h-full w-full origin-top-left"
        style={{ transform: `scale(${zoom / 100})` }}
      >
        {/* Edge SVG layer with Crow's Foot markers */}
        <svg
          data-testid="erd-edge-layer"
          className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
        >
          <CrowsFootMarker idPrefix="erd" />
          {laidOut.edges.map((edge: ErdEdge) => {
            const { markerStart, markerEnd } = markerForCardinality(
              edge.cardinality,
              "erd"
            );
            return (
              <g key={edge.id}>
                <path
                  data-testid={`erd-edge-${edge.id}`}
                  d={edge.path}
                  fill="none"
                  stroke="var(--teal)"
                  strokeWidth={1.8}
                  strokeOpacity={0.7}
                  markerStart={markerStart}
                  markerEnd={markerEnd}
                />
                {/* Cardinality label at midpoint */}
                <EdgeLabel edge={edge} />
              </g>
            );
          })}
        </svg>

        {/* Table entity cards */}
        {laidOut.tables.map((table) => {
          return (
            <div
              key={table.id}
              onMouseDown={(e) => handleMouseDown(e, table)}
              onMouseEnter={() => setHoveredColumn(null)}
            >
              <EntityCard
                table={table}
                selected={selected === table.id}
                onSelect={(e) => {
                  e.stopPropagation();
                  onSelect(table.id);
                }}
                onDelete={onDeleteNode ? () => onDeleteNode(table.id) : undefined}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Small cardinality label rendered at the midpoint of an ERD edge. */
function EdgeLabel({ edge }: { edge: ErdEdge }) {
  // Extract the midpoint from the path's L commands
  const midX = (edge.fromMarker.x + edge.toMarker.x) / 2;
  const midY = (edge.fromMarker.y + edge.toMarker.y) / 2;
  const label =
    edge.cardinality === "one-to-one"
      ? "1:1"
      : edge.cardinality === "many-to-many"
      ? "M:N"
      : "1:N";
  return (
    <g pointerEvents="none">
      <rect
        x={midX - 14}
        y={midY - 9}
        width={28}
        height={18}
        rx={4}
        fill="var(--surface)"
        stroke="var(--border)"
        strokeWidth={1}
      />
      <text
        x={midX}
        y={midY + 4}
        textAnchor="middle"
        className="font-mono"
        fontSize={10}
        fill="var(--teal)"
      >
        {label}
      </text>
    </g>
  );
}
