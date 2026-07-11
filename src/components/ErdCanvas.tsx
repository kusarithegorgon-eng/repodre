/**
 * ErdCanvas — Database ERD viewport
 *
 * Renders the relational grid: dense entity cards (tables with column rows)
 * connected by orthogonal SVG paths with Crow's Foot cardinality markers.
 *
 * Features:
 * - Crow's Foot notation for 1:1, 1:N, M:N relationships
 * - Click on an edge to highlight related tables + show constraint tooltip
 * - Non-related nodes dim when an edge is selected
 * - Edit-in-place for table/column names via EntityCard
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
import { X } from "lucide-react";

interface ErdCanvasProps {
  nodes: Node[];
  edges: Edge[];
  selected: string | null;
  onSelect: (id: string | null) => void;
  onDragEnd: (id: string, x: number, y: number) => void;
  onDeleteNode?: (id: string) => void;
  zoom: number;
  panX?: number;
  panY?: number;
  onCanvasMouseDown?: (e: React.MouseEvent) => void;
  cursor?: string;
  /** Called when user renames a column in-place (for SQL sync) */
  onRenameColumn?: (nodeId: string, oldName: string, newName: string) => void;
  /** Called when user renames a table */
  onRenameTable?: (nodeId: string, newName: string) => void;
}

export function ErdCanvas({
  nodes,
  edges,
  selected,
  onSelect,
  onDragEnd,
  onDeleteNode,
  zoom,
  panX = 0,
  panY = 0,
  onCanvasMouseDown,
  cursor,
  onRenameColumn,
  onRenameTable,
}: ErdCanvasProps) {
  // Filter to ERD table nodes only
  const tableNodes = nodes.filter((n) => n.workspace === "erd" && n.columns);

  // Selected edge for relationship highlight
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  // Constraint tooltip state
  const [constraintTooltip, setConstraintTooltip] = useState<{
    edgeId: string;
    fromTable: string;
    toTable: string;
    fromColumn: string;
    toColumn: string;
    cardinality: string;
    x: number;
    y: number;
  } | null>(null);

  // Build the layout input from live node/edge state
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

  // Drag state
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

  // Handle edge click — show constraint tooltip and highlight related tables
  const handleEdgeClick = useCallback(
    (e: React.MouseEvent, edge: ErdEdge, erdEdge: { fromTableId: string; toTableId: string; fromColumn: string; toColumn: string; cardinality: string }) => {
      e.stopPropagation();
      if (selectedEdgeId === edge.id) {
        setSelectedEdgeId(null);
        setConstraintTooltip(null);
        return;
      }
      setSelectedEdgeId(edge.id);

      const fromTable = tableById.get(erdEdge.fromTableId);
      const toTable = tableById.get(erdEdge.toTableId);

      setConstraintTooltip({
        edgeId: edge.id,
        fromTable: fromTable?.name ?? erdEdge.fromTableId,
        toTable: toTable?.name ?? erdEdge.toTableId,
        fromColumn: erdEdge.fromColumn,
        toColumn: erdEdge.toColumn,
        cardinality: erdEdge.cardinality,
        x: e.clientX,
        y: e.clientY,
      });
    },
    [selectedEdgeId, tableById]
  );

  // Tables involved in the selected edge (for dimming)
  const highlightedTableIds = useMemo(() => {
    if (!selectedEdgeId) return new Set<string>();
    const srcEdge = edges.find((e) => e.id === selectedEdgeId);
    if (!srcEdge) return new Set<string>();
    return new Set([srcEdge.from, srcEdge.to]);
  }, [selectedEdgeId, edges]);

  const cardinalityLabel = (c: string) =>
    c === "one-to-one" ? "1:1" : c === "many-to-many" ? "M:N" : "1:N";

  if (tableNodes.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center text-center">
        <div className="max-w-sm">
          <div className="mb-4 flex h-16 w-16 mx-auto items-center justify-center rounded-2xl bg-surface border border-border shadow">
            <svg viewBox="0 0 14 16" fill="none" className="h-8 w-8">
              <rect x="1" y="3" width="12" height="10" stroke="var(--muted-foreground)" strokeWidth="1.2" />
              <ellipse cx="7" cy="3" rx="6" ry="2.5" stroke="var(--muted-foreground)" strokeWidth="1.2" />
              <ellipse cx="7" cy="13" rx="6" ry="2.5" stroke="var(--muted-foreground)" strokeWidth="1.2" />
            </svg>
          </div>
          <p className="text-sm font-semibold text-foreground">No tables yet</p>
          <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
            Click the <strong>Database</strong> icon in the sidebar to import a DDL schema
            (PostgreSQL, MySQL, or SQLite).
          </p>
        </div>
      </div>
    );
  }

  // Build edge lookup for click handler
  const edgeLookup = new Map(
    edges
      .filter((e) => e.cardinality && e.fromColumn && e.toColumn)
      .map((e) => [e.id, e])
  );

  return (
    <>
      <div
        className="grid-canvas absolute inset-0 overflow-hidden"
        onClick={() => { onSelect(null); setSelectedEdgeId(null); setConstraintTooltip(null); }}
        onMouseDown={onCanvasMouseDown}
        style={{ cursor }}
      >
        <div
          className="relative h-full w-full origin-top-left"
          style={{ transform: `translate3d(${panX}px, ${panY}px, 0) scale(${zoom / 100})` }}
        >
          {/* Edge SVG layer with Crow's Foot markers */}
          <svg
            data-testid="erd-edge-layer"
            className="absolute inset-0 h-full w-full overflow-visible"
            style={{ pointerEvents: "none" }}
          >
            <CrowsFootMarker idPrefix="erd" />
            {laidOut.edges.map((edge: ErdEdge) => {
              const srcEdge = edgeLookup.get(edge.id);
              const isSelectedEdge = edge.id === selectedEdgeId;
              const isRelated = highlightedTableIds.size > 0 && (
                highlightedTableIds.has(srcEdge?.from ?? "") || highlightedTableIds.has(srcEdge?.to ?? "")
              );
              const isDimmed = selectedEdgeId !== null && !isSelectedEdge && !isRelated;
              const { markerStart, markerEnd } = markerForCardinality(edge.cardinality, "erd");

              return (
                <g key={edge.id}>
                  {/* Wider invisible hit area */}
                  <path
                    d={edge.path}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={16}
                    style={{ pointerEvents: "stroke", cursor: "pointer" }}
                    onClick={(e) => {
                      if (srcEdge) {
                        handleEdgeClick(e as unknown as React.MouseEvent, edge, {
                          fromTableId: srcEdge.from,
                          toTableId: srcEdge.to,
                          fromColumn: srcEdge.fromColumn!,
                          toColumn: srcEdge.toColumn!,
                          cardinality: srcEdge.cardinality!,
                        });
                      }
                    }}
                  />
                  <path
                    data-testid={`erd-edge-${edge.id}`}
                    d={edge.path}
                    fill="none"
                    stroke={isSelectedEdge ? "var(--teal)" : "var(--teal)"}
                    strokeWidth={isSelectedEdge ? 2.5 : 1.8}
                    strokeOpacity={isDimmed ? 0.15 : isSelectedEdge ? 1 : 0.65}
                    markerStart={markerStart}
                    markerEnd={markerEnd}
                    style={{ transition: "stroke-opacity 200ms" }}
                  />
                  {/* Cardinality label at midpoint */}
                  <EdgeLabel edge={edge} dimmed={isDimmed} selected={isSelectedEdge} />
                </g>
              );
            })}
          </svg>

          {/* Table entity cards */}
          {laidOut.tables.map((table) => {
            const isDimmed = selectedEdgeId !== null && !highlightedTableIds.has(table.id);
            return (
              <div
                key={table.id}
                onMouseDown={(e) => handleMouseDown(e, table)}
                style={{
                  opacity: isDimmed ? 0.35 : 1,
                  transition: "opacity 200ms",
                }}
              >
                <EntityCard
                  table={table}
                  selected={selected === table.id}
                  onSelect={(e) => {
                    e.stopPropagation();
                    setSelectedEdgeId(null);
                    setConstraintTooltip(null);
                    onSelect(table.id);
                  }}
                  onDelete={onDeleteNode ? () => onDeleteNode(table.id) : undefined}
                  onRenameColumn={onRenameColumn ? (oldName, newName) => onRenameColumn(table.id, oldName, newName) : undefined}
                  onRenameTable={onRenameTable ? (newName) => onRenameTable(table.id, newName) : undefined}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Constraint tooltip (fixed position relative to viewport) */}
      {constraintTooltip && (
        <div
          className="fixed z-[200] w-72 rounded-xl border border-border bg-popover shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200"
          style={{
            left: Math.min(constraintTooltip.x + 12, window.innerWidth - 300),
            top: Math.min(constraintTooltip.y - 20, window.innerHeight - 200),
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between bg-teal/10 border-b border-border px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-5 items-center justify-center rounded bg-teal/20 px-1.5 font-mono text-[10px] font-bold text-teal">
                {cardinalityLabel(constraintTooltip.cardinality)}
              </span>
              <span className="text-xs font-semibold text-foreground">Relationship Constraint</span>
            </div>
            <button
              onClick={() => { setSelectedEdgeId(null); setConstraintTooltip(null); }}
              className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
          <div className="p-3">
            <div className="rounded-lg bg-background border border-border p-2 font-mono text-xs text-foreground">
              <span className="text-teal">{constraintTooltip.fromTable}</span>
              <span className="text-muted-foreground">.</span>
              <span>{constraintTooltip.fromColumn}</span>
              <span className="text-muted-foreground mx-1.5">→</span>
              <span className="text-teal">{constraintTooltip.toTable}</span>
              <span className="text-muted-foreground">.</span>
              <span>{constraintTooltip.toColumn}</span>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              {constraintTooltip.cardinality === "one-to-one"
                ? `Each ${constraintTooltip.fromTable} row maps to exactly one ${constraintTooltip.toTable} row.`
                : constraintTooltip.cardinality === "many-to-many"
                ? `Many ${constraintTooltip.fromTable} rows can relate to many ${constraintTooltip.toTable} rows.`
                : `One ${constraintTooltip.fromTable} row can relate to many ${constraintTooltip.toTable} rows.`}
            </p>
          </div>
        </div>
      )}
    </>
  );
}

/** Cardinality label rendered at the midpoint of an ERD edge. */
function EdgeLabel({ edge, dimmed, selected }: { edge: ErdEdge; dimmed: boolean; selected: boolean }) {
  const midX = (edge.fromMarker.x + edge.toMarker.x) / 2;
  const midY = (edge.fromMarker.y + edge.toMarker.y) / 2;
  const label =
    edge.cardinality === "one-to-one" ? "1:1"
    : edge.cardinality === "many-to-many" ? "M:N"
    : "1:N";

  return (
    <g pointerEvents="none" opacity={dimmed ? 0.15 : 1} style={{ transition: "opacity 200ms" }}>
      <rect
        x={midX - 14}
        y={midY - 9}
        width={28}
        height={18}
        rx={5}
        fill="var(--surface)"
        stroke={selected ? "var(--teal)" : "var(--border)"}
        strokeWidth={selected ? 1.5 : 1}
      />
      <text
        x={midX}
        y={midY + 4}
        textAnchor="middle"
        fontFamily="ui-monospace, monospace"
        fontSize={10}
        fontWeight={selected ? "700" : "600"}
        fill={selected ? "var(--teal)" : "var(--teal)"}
      >
        {label}
      </text>
    </g>
  );
}
