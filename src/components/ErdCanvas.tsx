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
  DragToConnectHandle,
  LiveEdgeDrawing,
  useDragToConnect,
} from "./DragToConnectHandles";
import {
  layoutErd,
  type ErdTableNode,
  type ErdEdge,
  type LaidOutErd,
} from "@/lib/erd-layout";
import type { Node, Edge } from "@/lib/db-client";
import type { HandleSegment } from "@/lib/canvas-geometry";
import { X, Trash2 } from "lucide-react";

function sectionColorHex(color: string): string {
  const map: Record<string, string> = {
    blue: "rgba(59, 130, 246, 0.06)",
    green: "rgba(34, 197, 94, 0.06)",
    teal: "rgba(20, 184, 166, 0.06)",
    orange: "rgba(249, 115, 22, 0.06)",
    red: "rgba(239, 68, 68, 0.06)",
    purple: "rgba(168, 85, 247, 0.06)",
    slate: "rgba(100, 116, 139, 0.06)",
  };
  return map[color] ?? map.blue;
}

function sectionBorderHex(color: string): string {
  const map: Record<string, string> = {
    blue: "rgba(59, 130, 246, 0.35)",
    green: "rgba(34, 197, 94, 0.35)",
    teal: "rgba(20, 184, 166, 0.35)",
    orange: "rgba(249, 115, 22, 0.35)",
    red: "rgba(239, 68, 68, 0.35)",
    purple: "rgba(168, 85, 247, 0.35)",
    slate: "rgba(100, 116, 139, 0.35)",
  };
  return map[color] ?? map.blue;
}

interface ErdCanvasProps {
  nodes: Node[];
  edges: Edge[];
  selected: string | null;
  onSelect: (id: string | null) => void;
  onDragEnd: (id: string, x: number, y: number) => void;
  onDeleteNode?: (id: string) => void;
  onDeleteEdge?: (id: string) => void;
  /** Called when the user drags a connection from one table to another. */
  onCreateEdge?: (fromId: string, fromHandle: HandleSegment, toId: string, toHandle: HandleSegment) => void;
  /** Notifies parent when an edge is selected (so keyboard delete works). */
  onEdgeSelect?: (edgeId: string | null) => void;
  zoom: number;
  panX?: number;
  panY?: number;
  onCanvasMouseDown?: (e: React.MouseEvent) => void;
  cursor?: string;
  /** Called when user renames a column in-place (for SQL sync) */
  onRenameColumn?: (nodeId: string, oldName: string, newName: string) => void;
  /** Called when user renames a table */
  onRenameTable?: (nodeId: string, newName: string) => void;
  /** Section containers to render behind ERD tables */
  sections?: Array<{ id: string; label: string; color: string; x: number; y: number; w: number; h: number; devStatus: string }>;
}

export function ErdCanvas({
  nodes,
  edges,
  selected,
  onSelect,
  onDragEnd,
  onDeleteNode,
  onDeleteEdge,
  onCreateEdge,
  onEdgeSelect,
  zoom,
  panX = 0,
  panY = 0,
  onCanvasMouseDown,
  cursor,
  onRenameColumn,
  onRenameTable,
  sections = [],
}: ErdCanvasProps) {
  // Filter to ERD table nodes only
  const tableNodes = nodes.filter((n) => n.workspace === "erd" && n.columns);

  // Selected edge for relationship highlight + deletion
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);

  // Canvas ref for drag-to-connect coordinate math
  const canvasRef = useRef<HTMLDivElement>(null);

  // Drag-to-connect hook (same mechanism as the App workspace)
  const dragToConnect = useDragToConnect({
    nodes: tableNodes.map((n) => ({
      id: n.id,
      shape: n.shape,
      x: n.x,
      y: n.y,
      w: n.w ?? 220,
      h: n.h ?? 160,
    })),
    zoom: zoom / 100,
    canvasRef,
    onConnect: useCallback(
      (fromId: string, fromHandle: HandleSegment, toId: string, toHandle: HandleSegment) => {
        onCreateEdge?.(fromId, fromHandle, toId, toHandle);
      },
      [onCreateEdge]
    ),
  });

  // Sync selected edge id upward so the keyboard shortcut can delete it
  useEffect(() => {
    onEdgeSelect?.(selectedEdgeId);
  }, [selectedEdgeId, onEdgeSelect]);
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
    if (selectedEdgeId) {
      const srcEdge = edges.find((e) => e.id === selectedEdgeId);
      if (!srcEdge) return new Set<string>();
      return new Set([srcEdge.from, srcEdge.to]);
    }
    // Path lighting: when a node is selected, highlight all nodes connected
    // to it through any edge (transitive closure via BFS).
    if (!selected) return new Set<string>();
    const adj = new Map<string, Set<string>>();
    for (const e of edges) {
      if (!adj.has(e.from)) adj.set(e.from, new Set());
      if (!adj.has(e.to)) adj.set(e.to, new Set());
      adj.get(e.from)!.add(e.to);
      adj.get(e.to)!.add(e.from);
    }
    const visited = new Set<string>([selected]);
    const queue = [selected];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      for (const next of adj.get(cur) ?? []) {
        if (!visited.has(next)) {
          visited.add(next);
          queue.push(next);
        }
      }
    }
    return visited;
  }, [selectedEdgeId, edges, selected]);

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
          {/* Section containers (behind ERD tables) */}
          {sections.map((s) => {
            const isReady = s.devStatus === "ready";
            const colorHex = isReady ? "rgba(34, 197, 94, 0.06)" : sectionColorHex(s.color);
            const borderColor = isReady ? "rgba(34, 197, 94, 0.35)" : sectionBorderHex(s.color);
            return (
              <div
                key={s.id}
                className="absolute rounded-2xl pointer-events-none"
                style={{
                  left: s.x,
                  top: s.y,
                  width: s.w,
                  height: s.h,
                  zIndex: 0,
                  background: colorHex,
                  border: `2px dashed ${borderColor}`,
                }}
              >
                <div
                  className="absolute top-0 left-0 right-0 flex items-center px-3 rounded-t-2xl"
                  style={{
                    height: 36,
                    background: isReady ? "rgba(34, 197, 94, 0.12)" : sectionBorderHex(s.color),
                    borderBottom: `1px solid ${borderColor}`,
                  }}
                >
                  <span className="text-sm font-semibold text-foreground/80 truncate">{s.label}</span>
                  {isReady && (
                    <span className="ml-2 rounded px-1.5 py-0.5 text-[10px] font-bold text-green-600" style={{ background: "rgba(34,197,94,0.15)" }}>
                      Ready for Dev
                    </span>
                  )}
                </div>
              </div>
            );
          })}

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
                highlightedTableIds.has(srcEdge?.from ?? "") && highlightedTableIds.has(srcEdge?.to ?? "")
              );
              const isDimmed = highlightedTableIds.size > 0 && !isSelectedEdge && !isRelated;
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
                  {/* Delete button on selected edge */}
                  {isSelectedEdge && onDeleteEdge && (() => {
                    const midX = (edge.fromMarker.x + edge.toMarker.x) / 2;
                    const midY = (edge.fromMarker.y + edge.toMarker.y) / 2;
                    return (
                      <g style={{ pointerEvents: "all" }}>
                        <circle cx={midX} cy={midY - 22} r={10} fill="var(--surface)" stroke="var(--teal)" strokeWidth={1.5} />
                        <text
                          x={midX}
                          y={midY - 18}
                          textAnchor="middle"
                          fontFamily="ui-monospace, monospace"
                          fontSize={11}
                          fontWeight={700}
                          fill="var(--teal)"
                          style={{ pointerEvents: "none", cursor: "pointer" }}
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteEdge(edge.id);
                            setSelectedEdgeId(null);
                            setConstraintTooltip(null);
                          }}
                        >
                          ×
                        </text>
                      </g>
                    );
                  })()}
                </g>
              );
            })}
          </svg>

          {/* Live edge drawing preview (drag-to-connect) */}
          <LiveEdgeDrawing
            isActive={dragToConnect.state.isDragging}
            startNode={
              dragToConnect.state.fromNodeId
                ? (() => {
                    const n = tableNodes.find((t) => t.id === dragToConnect.state.fromNodeId);
                    return n
                      ? { id: n.id, shape: n.shape, x: n.x, y: n.y, w: n.width, h: n.height }
                      : null;
                  })()
                : null
            }
            startHandle={dragToConnect.state.fromHandle}
            currentMousePos={dragToConnect.state.mousePos}
            zoom={zoom / 100}
            accentColor="var(--teal)"
          />

          {/* Table entity cards */}
          {laidOut.tables.map((table) => {
            const isDimmed = highlightedTableIds.size > 0 && !highlightedTableIds.has(table.id);
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
                {/* Drag-to-connect handles (visible on hover) */}
                <DragToConnectHandle
                  shape={table.shape}
                  x={table.x}
                  y={table.y}
                  w={table.width}
                  h={table.height}
                  accentColor="var(--teal)"
                  accentGlow="var(--teal)"
                  visible={selected === table.id}
                  onStartDrag={(handleId, startPos) => {
                    dragToConnect.startDrag(table.id, handleId, startPos);
                  }}
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
