import { useMemo } from "react";
import { AlertTriangle, X, CheckCircle } from "lucide-react";
import type { NodeData, EdgeData } from "@/lib/canvas-geometry";

interface OrphanCheckPanelProps {
  isOpen: boolean;
  onClose: () => void;
  nodes: NodeData[];
  edges: EdgeData[];
  onSelectNode: (id: string) => void;
}

export function OrphanCheckPanel({ isOpen, onClose, nodes, edges, onSelectNode }: OrphanCheckPanelProps) {
  const { orphans, metrics } = useMemo(() => {
    const connected = new Set<string>();
    for (const e of edges) { connected.add(e.from); connected.add(e.to); }
    const orphans = nodes.filter((n) => !connected.has(n.id));

    // Complexity metrics
    const incoming = new Map<string, number>();
    const outgoing = new Map<string, number>();
    for (const e of edges) {
      outgoing.set(e.from, (outgoing.get(e.from) ?? 0) + 1);
      incoming.set(e.to, (incoming.get(e.to) ?? 0) + 1);
    }
    const totalDepths = nodes.map((n) => (incoming.get(n.id) ?? 0) + (outgoing.get(n.id) ?? 0));
    const avgDepth = totalDepths.length > 0 ? (totalDepths.reduce((a, b) => a + b, 0) / totalDepths.length).toFixed(2) : "0";
    const maxDepth = totalDepths.length > 0 ? Math.max(...totalDepths) : 0;

    return {
      orphans,
      metrics: {
        totalNodes: nodes.length,
        totalEdges: edges.length,
        orphanCount: orphans.length,
        avgDepth,
        maxDepth,
        services: nodes.filter((n) => n.shape === "rectangle" || n.shape === "hexagon").length,
        databases: nodes.filter((n) => n.shape === "cylinder").length,
      },
    };
  }, [nodes, edges]);

  if (!isOpen) return null;

  return (
    <div className="absolute left-4 top-4 z-50 w-80 rounded-xl border p-4 shadow-2xl backdrop-blur"
      style={{ background: "color-mix(in srgb, var(--popover) 95%, transparent)", borderColor: "var(--border)" }}>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" style={{ color: "var(--teal)" }} />
          <h3 className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>System Health Monitor</h3>
        </div>
        <button onClick={onClose} className="flex h-6 w-6 items-center justify-center rounded hover:bg-accent" style={{ color: "var(--muted-foreground)" }}><X className="h-4 w-4" /></button>
      </div>

      {/* Complexity Metrics */}
      <div className="mb-4 rounded-lg border p-3" style={{ background: "var(--background)", borderColor: "var(--border)" }}>
        <div className="mb-2 text-[10px] font-medium uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>Complexity Score</div>
        <div className="grid grid-cols-2 gap-2">
          <Metric label="Components" value={metrics.totalNodes} />
          <Metric label="Connections" value={metrics.totalEdges} />
          <Metric label="Avg Depth" value={metrics.avgDepth} />
          <Metric label="Max Depth" value={metrics.maxDepth} />
          <Metric label="Services" value={metrics.services} />
          <Metric label="Databases" value={metrics.databases} />
        </div>
      </div>

      {/* Orphaned Nodes */}
      <div className="mb-2 flex items-center gap-1.5 text-xs font-medium" style={{ color: "var(--foreground)" }}>
        <AlertTriangle className="h-3.5 w-3.5" style={{ color: orphans.length > 0 ? "var(--orange)" : "var(--green)" }} />
        Orphaned Components ({orphans.length})
      </div>

      {orphans.length === 0 ? (
        <div className="flex items-center gap-2 rounded-lg border border-dashed p-4" style={{ borderColor: "var(--border)" }}>
          <CheckCircle className="h-5 w-5" style={{ color: "var(--green)" }} />
          <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>All components are connected</span>
        </div>
      ) : (
        <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
          {orphans.map((n) => (
            <button key={n.id} onClick={() => onSelectNode(n.id)}
              className="flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left transition-all hover:border-teal"
              style={{ borderColor: "var(--border)", background: "var(--background)" }}>
              <div className="flex h-6 w-6 items-center justify-center rounded-full" style={{ background: "color-mix(in srgb, var(--orange) 15%, transparent)" }}>
                <AlertTriangle className="h-3 w-3" style={{ color: "var(--orange)" }} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium" style={{ color: "var(--foreground)" }}>{n.label}</div>
                <div className="text-[10px]" style={{ color: "var(--muted-foreground)" }}>No incoming or outgoing connections</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border px-2 py-1.5" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
      <div className="text-[10px]" style={{ color: "var(--muted-foreground)" }}>{label}</div>
      <div className="text-sm font-bold" style={{ color: "var(--foreground)" }}>{value}</div>
    </div>
  );
}
