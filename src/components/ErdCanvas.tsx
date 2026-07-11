/**
 * ErdCanvas — Database ERD viewport
 *
 * Renders the relational grid: dense entity cards (tables with column rows)
 * connected by obstacle-aware Manhattan SVG paths with Crow's Foot cardinality
 * markers.
 *
 * Features:
 * - Obstacle-aware Manhattan routing (90-degree orthogonal paths around tables)
 * - Hop-arc "bridge" bumps where edges cross
 * - Crow's Foot notation for 1:1, 1:N, M:N relationships
 * - Selective highlighting: click a node or edge to dim all non-connected
 *   edges to 20% opacity and highlight the active path in high-contrast teal
 * - Segmented edge labels ("parent_col → child_col") at edge midpoints
 * - Visual grouping: FK-connected tables are enclosed in labeled subgraph
 *   containers to reduce visual clutter
 * - Edit-in-place for table/column names via EntityCard
 */

import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { EntityCard } from "./EntityCard";
import { CrowsFootMarker, markerForCardinality } from "./CrowsFootMarker";
import {
  layoutErd,
  type ErdTableNode,
  type ErdEdge,
  type ErdSubgraph,
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
  canEdit?: boolean;
  canDelete?: boolean;
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
  canEdit = true,
  canDelete = true,
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
  // Hovered node id for hover-based highlighting
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
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

  // Compute the active highlight set from either a selected node, selected
  // edge, or hovered node. When active, all edges NOT connected to the
  // active node(s) are dimmed to 20% opacity.
  const { activeNodeIds, activeEdgeIds } = useMemo(() => {
    const nodeIds = new Set<string>();
    const edgeIds = new Set<string>();

    // Edge selection takes priority
    if (selectedEdgeId) {
      const srcEdge = edges.find((e) => e.id === selectedEdgeId);
      if (srcEdge) {
        nodeIds.add(srcEdge.from);
        nodeIds.add(srcEdge.to);
        edgeIds.add(srcEdge.id);
      }
    } else {
      // Node selection or hover
      const activeId = selected ?? hoveredNodeId;
      if (activeId) {
        nodeIds.add(activeId);
        for (const e of edges) {
          if (e.from === activeId || e.to === activeId) {
            edgeIds.add(e.id);
            nodeIds.add(e.from);
            nodeIds.add(e.to);
          }
        }
      }
    }

    return { activeNodeIds: nodeIds, activeEdgeIds: edgeIds };
  }, [selectedEdgeId, selected, hoveredNodeId, edges]);

  const hasActiveHighlight = activeNodeIds.size > 0 || activeEdgeIds.size > 0;

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
          {/* ── Subgraph containers (rendered behind edges and tables) ── */}
          {laidOut.subgraphs.map((sg) => (
            <SubgraphContainer
              key={sg.id}
              subgraph={sg}
              dimmed={hasActiveHighlight && !sg.tableIds.some((id) => activeNodeIds.has(id))}
            />
          ))}

          {/* Edge SVG layer with Crow's Foot markers */}
          <svg
            data-testid="erd-edge-layer"
            className="absolute inset-0 h-full w-full overflow-visible"
            style={{ pointerEvents: "none" }}
          >
            <CrowsFootMarker idPrefix="erd" />
            {laidOut.edges.map((edge: ErdEdge) => {
              const srcEdge = edgeLookup.get(edge.id);
              const isActive = activeEdgeIds.has(edge.id);
              const isDimmed = hasActiveHighlight && !isActive;

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
                    stroke={isActive ? "var(--teal)" : "var(--teal)"}
                    strokeWidth={isActive ? 3 : 1.8}
                    strokeOpacity={isDimmed ? 0.2 : isActive ? 1 : 0.65}
                    markerStart={markerStart}
                    markerEnd={markerEnd}
                    style={{ transition: "stroke-opacity 200ms, stroke-width 200ms" }}
                  />
                  {/* Segmented edge label: "from_col → to_col" */}
                  <SegmentedEdgeLabel
                    edge={edge}
                    fromTableName={tableById.get(edge.fromTableId)?.name ?? edge.fromTableId}
                    toTableName={tableById.get(edge.toTableId)?.name ?? edge.toTableId}
                    dimmed={isDimmed}
                    active={isActive}
                  />
                </g>
              );
            })}
          </svg>

          {/* Table entity cards */}
          {laidOut.tables.map((table) => {
            const isDimmed = hasActiveHighlight && !activeNodeIds.has(table.id);
            return (
              <div
                key={table.id}
                onMouseDown={(e) => handleMouseDown(e, table)}
                onMouseEnter={() => setHoveredNodeId(table.id)}
                onMouseLeave={() => setHoveredNodeId(null)}
                style={{
                  opacity: isDimmed ? 0.2 : 1,
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

// ─── Subgraph Container ─────────────────────────────────────────────────────

function SubgraphContainer({
  subgraph,
  dimmed,
}: {
  subgraph: ErdSubgraph;
  dimmed: boolean;
}) {
  return (
    <div
      className="pointer-events-none absolute rounded-2xl border-2 border-dashed transition-opacity duration-200"
      style={{
        left: subgraph.x,
        top: subgraph.y,
        width: subgraph.width,
        height: subgraph.height,
        borderColor: dimmed ? "color-mix(in oklab, var(--neon-blue) 15%, transparent)" : "color-mix(in oklab, var(--neon-blue) 35%, transparent)",
        backgroundColor: "color-mix(in oklab, var(--neon-blue) 4%, transparent)",
        opacity: dimmed ? 0.3 : 1,
        zIndex: 0,
      }}
    >
      {/* Label badge in top-left corner */}
      <div
        className="absolute -top-3 left-4 flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
        style={{
          backgroundColor: dimmed ? "color-mix(in oklab, var(--neon-blue) 8%, var(--surface))" : "color-mix(in oklab, var(--neon-blue) 15%, var(--surface))",
          color: dimmed ? "color-mix(in oklab, var(--neon-blue) 40%, var(--muted-foreground))" : "var(--neon-blue)",
          border: `1px solid color-mix(in oklab, var(--neon-blue) ${dimmed ? 15 : 30}%, transparent)`,
        }}
      >
        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: "var(--neon-blue)" }} />
        {subgraph.label}
        <span className="ml-1 text-muted-foreground/60 normal-case tracking-normal">
          ({subgraph.tableIds.length})
        </span>
      </div>
    </div>
  );
}

// ─── Segmented Edge Label ───────────────────────────────────────────────────

/**
 * Renders a two-part label at the edge midpoint:
 *   Line 1: cardinality badge (1:1, 1:N, M:N)
 *   Line 2: "from_col → to_col" segmented path label
 *
 * When the edge is dimmed (not part of the active highlight), the label
 * fades to match. When active, it uses high-contrast teal.
 */
function SegmentedEdgeLabel({
  edge,
  fromTableName,
  toTableName,
  dimmed,
  active,
}: {
  edge: ErdEdge;
  fromTableName: string;
  toTableName: string;
  dimmed: boolean;
  active: boolean;
}) {
  const { labelPoint } = edge;
  const cardLabel =
    edge.cardinality === "one-to-one" ? "1:1"
    : edge.cardinality === "many-to-many" ? "M:N"
    : "1:N";

  const segmentLabel = `${edge.fromColumn} → ${edge.toColumn}`;

  // Estimate text widths for the background rect
  const cardWidth = cardLabel.length * 7 + 12;
  const segWidth = segmentLabel.length * 5.5 + 12;
  const bgWidth = Math.max(cardWidth, segWidth);

  return (
    <g
      pointerEvents="none"
      opacity={dimmed ? 0.2 : 1}
      style={{ transition: "opacity 200ms" }}
      transform={`translate(${labelPoint.x}, ${labelPoint.y})`}
    >
      <rect
        x={-bgWidth / 2}
        y={-16}
        width={bgWidth}
        height={32}
        rx={6}
        fill="var(--surface)"
        stroke={active ? "var(--teal)" : "var(--border)"}
        strokeWidth={active ? 1.5 : 1}
        opacity={0.95}
      />
      {/* Cardinality badge */}
      <text
        x={0}
        y={-4}
        textAnchor="middle"
        fontFamily="ui-monospace, monospace"
        fontSize={9}
        fontWeight={700}
        fill={active ? "var(--teal)" : "var(--teal)"}
      >
        {cardLabel}
      </text>
      {/* Segmented column label */}
      <text
        x={0}
        y={8}
        textAnchor="middle"
        fontFamily="ui-monospace, monospace"
        fontSize={8}
        fontWeight={500}
        fill="var(--muted-foreground)"
      >
        {segmentLabel}
      </text>
    </g>
  );
}
