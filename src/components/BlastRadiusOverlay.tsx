/**
 * BlastRadiusOverlay — What-If Impact Analysis Visualization
 *
 * When a node is selected and What-If mode is active, this overlay:
 *   - dims all nodes outside the blast radius
 *   - highlights affected nodes with a colored ring matching their depth
 *   - renders a floating summary panel listing affected routes/services
 *   - shows a "Simulate Deletion" toggle that previews broken connections
 */

import { useEffect, useMemo, useState } from "react";
import { Crosshair, X, TriangleAlert as AlertTriangle, Route, Server, Trash2, Eye } from "lucide-react";
import { computeBlastRadius, simulateDeletion, type ImpactCategory } from "@/lib/blast-radius";

interface BlastRadiusOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  originId: string | null;
  nodes: Array<{ id: string; label: string; sub: string; shape: string; x: number; y: number }>;
  edges: Array<{ id: string; from: string; to: string }>;
  /** Called with the set of node IDs to dim (outside blast radius) */
  onDimNodes?: (ids: Set<string>) => void;
  /** Called with the set of node IDs to highlight (inside blast radius) */
  onHighlightNodes?: (ids: Set<string>) => void;
}

const DEPTH_COLORS = [
  "#dc2626", // depth 1 — direct, red
  "#ea580c", // depth 2 — orange
  "#d97706", // depth 3 — amber
  "#65a30d", // depth 4+ — green
];

export function BlastRadiusOverlay({
  isOpen,
  onClose,
  originId,
  nodes,
  edges,
  onDimNodes,
  onHighlightNodes,
}: BlastRadiusOverlayProps) {
  const [simulateDelete, setSimulateDelete] = useState(false);

  const result = useMemo(() => {
    if (!isOpen || !originId) return null;
    return computeBlastRadius(originId, nodes, edges);
  }, [isOpen, originId, nodes, edges]);

  const deletionSim = useMemo(() => {
    if (!isOpen || !originId || !simulateDelete) return null;
    return simulateDeletion(originId, nodes, edges);
  }, [isOpen, originId, simulateDelete, nodes, edges]);

  // Notify parent of dim/highlight sets whenever the result changes.
  useEffect(() => {
    if (!result) {
      onDimNodes?.(new Set());
      onHighlightNodes?.(new Set());
      return;
    }
    const allIds = new Set(nodes.map((n) => n.id));
    const dimIds = new Set<string>();
    for (const id of allIds) {
      if (id !== result.originId && !result.affectedIds.has(id)) {
        dimIds.add(id);
      }
    }
    onDimNodes?.(dimIds);
    onHighlightNodes?.(new Set([result.originId, ...result.affectedIds]));
  }, [result, nodes, onDimNodes, onHighlightNodes]);

  if (!isOpen || !originId || !result) return null;

  const originNode = nodes.find((n) => n.id === originId);
  const directCount = Array.from(result.impacts.values()).filter((i) => i.category === "direct-dependent").length;
  const transitiveCount = Array.from(result.impacts.values()).filter((i) => i.category === "transitive-dependent").length;
  const orphanedCount = Array.from(result.impacts.values()).filter((i) => i.category === "orphaned-by-deletion").length;

  return (
    <div className="absolute right-4 top-16 z-50 w-80 rounded-xl border border-border bg-popover/95 p-4 shadow-2xl backdrop-blur-md">
      {/* Header */}
      <div className="mb-4 flex items-start justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange/10">
            <Crosshair className="h-4 w-4 text-orange" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Blast Radius</h3>
            <p className="text-[10px] text-muted-foreground">
              Impact analysis for <span className="font-mono">{originNode?.label ?? originId}</span>
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Stats grid */}
      <div className="mb-4 grid grid-cols-3 gap-2">
        <StatCard label="Direct" value={directCount} color="text-red-500" />
        <StatCard label="Transitive" value={transitiveCount} color="text-orange-500" />
        <StatCard label="Orphaned" value={orphanedCount} color="text-amber-500" />
      </div>

      {/* Broken edges */}
      <div className="mb-4 rounded-lg border border-border bg-background/50 p-2.5">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
            Broken connections
          </span>
          <span className="font-mono text-xs font-semibold text-amber-500">{result.brokenEdgeIds.size}</span>
        </div>
      </div>

      {/* Affected routes */}
      {result.affectedRouteIds.size > 0 && (
        <div className="mb-3">
          <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <Route className="h-3 w-3" />
            Affected routes
          </p>
          <div className="max-h-24 space-y-1 overflow-y-auto">
            {Array.from(result.affectedRouteIds).map((id) => {
              const n = nodes.find((x) => x.id === id);
              return (
                <div key={id} className="flex items-center gap-1.5 rounded bg-background px-2 py-1 text-xs">
                  <span className="font-mono text-muted-foreground">{n?.label ?? id}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* What-If simulation toggle */}
      <button
        onClick={() => setSimulateDelete(!simulateDelete)}
        className={`mb-3 flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-all ${
          simulateDelete
            ? "border-red-500/50 bg-red-500/10 text-red-500"
            : "border-border bg-background text-muted-foreground hover:border-red-500/40 hover:text-red-500"
        }`}
      >
        {simulateDelete ? <Eye className="h-3.5 w-3.5" /> : <Trash2 className="h-3.5 w-3.5" />}
        {simulateDelete ? "Exit simulation" : "Simulate deletion"}
      </button>

      {/* Deletion simulation results */}
      {deletionSim && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-red-500">
            Deletion preview
          </p>
          <p className="text-xs leading-relaxed text-muted-foreground">{deletionSim.summary}</p>
          {deletionSim.affectedRoutes.length > 0 && (
            <div className="mt-2">
              <p className="mb-1 text-[10px] text-muted-foreground">Routes that break:</p>
              <div className="flex flex-wrap gap-1">
                {deletionSim.affectedRoutes.map((r) => (
                  <span key={r} className="rounded bg-red-500/10 px-1.5 py-0.5 font-mono text-[10px] text-red-500">
                    {r}
                  </span>
                ))}
              </div>
            </div>
          )}
          {deletionSim.affectedServices.length > 0 && (
            <div className="mt-2">
              <p className="mb-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                <Server className="h-3 w-3" /> Services impacted:
              </p>
              <div className="flex flex-wrap gap-1">
                {deletionSim.affectedServices.map((s) => (
                  <span key={s} className="rounded bg-orange/10 px-1.5 py-0.5 font-mono text-[10px] text-orange">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Legend */}
      <div className="mt-3 border-t border-border pt-3">
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Depth legend</p>
        <div className="flex flex-wrap gap-2 text-[10px]">
          {DEPTH_COLORS.map((color, i) => (
            <span key={i} className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full" style={{ background: color }} />
              {i + 1}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-border bg-background/50 p-2">
      <span className={`text-lg font-bold ${color}`}>{value}</span>
      <span className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</span>
    </div>
  );
}

export function BlastRadiusToggle({
  isActive,
  onClick,
  disabled,
}: {
  isActive: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title="Blast-radius impact analysis"
      className={`flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-medium transition-all ${
        isActive
          ? "border-orange/50 bg-orange/10 text-orange"
          : "border-border bg-background text-muted-foreground hover:border-orange hover:text-orange disabled:opacity-40"
      }`}
    >
      <Crosshair className="h-3.5 w-3.5" />
      Blast Radius
    </button>
  );
}
