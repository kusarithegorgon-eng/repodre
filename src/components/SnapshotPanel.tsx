import { useState, useEffect, useCallback } from "react";
import { Clock, Save, Trash2, RotateCcw, X, Loader2 } from "lucide-react";
import { listSnapshots, createSnapshot, deleteSnapshot, type Snapshot } from "@/lib/db-client";
import type { NodeData, EdgeData } from "@/lib/canvas-geometry";

interface SnapshotPanelProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  nodes: NodeData[];
  edges: EdgeData[];
  onRestore: (nodes: NodeData[], edges: EdgeData[]) => void;
}

export function SnapshotPanel({ isOpen, onClose, projectId, nodes, edges, onRestore }: SnapshotPanelProps) {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setSnapshots(await listSnapshots(projectId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load snapshots");
    } finally { setLoading(false); }
  }, [projectId]);

  useEffect(() => { if (isOpen) load(); }, [isOpen, load]);

  const handleSave = async () => {
    if (!name.trim()) { setError("Please enter a version name"); return; }
    setSaving(true); setError(null);
    try {
      await createSnapshot(projectId, name.trim(), desc.trim() || null, nodes, edges);
      setName(""); setDesc("");
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Failed to save snapshot"); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    try { await deleteSnapshot(id); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "Failed to delete snapshot"); }
  };

  const handleRestore = (s: Snapshot) => {
    onRestore(s.nodes, s.edges);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="absolute left-4 top-4 z-50 w-80 rounded-xl border p-4 shadow-2xl backdrop-blur"
      style={{ background: "color-mix(in srgb, var(--popover) 95%, transparent)", borderColor: "var(--border)" }}>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4" style={{ color: "var(--teal)" }} />
          <h3 className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>Snapshots & Time Travel</h3>
        </div>
        <button onClick={onClose} className="flex h-6 w-6 items-center justify-center rounded hover:bg-accent" style={{ color: "var(--muted-foreground)" }}><X className="h-4 w-4" /></button>
      </div>

      {error && <div className="mb-3 rounded-lg border px-3 py-2 text-xs" style={{ borderColor: "color-mix(in srgb, var(--red) 30%, transparent)", background: "color-mix(in srgb, var(--red) 10%, transparent)", color: "var(--red)" }}>{error}</div>}

      {/* Save new snapshot */}
      <div className="mb-4 rounded-lg border p-3" style={{ borderColor: "var(--border)", background: "var(--background)" }}>
        <div className="mb-2 flex items-center gap-1.5 text-xs font-medium" style={{ color: "var(--foreground)" }}>
          <Save className="h-3.5 w-3.5" style={{ color: "var(--teal)" }} /> Save Current Version
        </div>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="v1.0 - Pre-Refactor"
          className="mb-1.5 w-full rounded-md border px-2.5 py-1.5 text-xs outline-none focus:border-teal"
          style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--foreground)" }} disabled={saving} />
        <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Description (optional)"
          className="mb-2 w-full rounded-md border px-2.5 py-1.5 text-xs outline-none focus:border-teal"
          style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--foreground)" }} disabled={saving} />
        <button onClick={handleSave} disabled={saving || !name.trim()}
          className="flex w-full items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-white transition-all hover:opacity-90 disabled:opacity-40"
          style={{ background: "var(--teal)" }}>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Save className="h-3.5 w-3.5" /> Save Snapshot</>}
        </button>
      </div>

      {/* Timeline */}
      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" style={{ color: "var(--muted-foreground)" }} /></div>
      ) : (
        <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
          {snapshots.length === 0 && (
            <div className="rounded-lg border border-dashed p-4 text-center" style={{ borderColor: "var(--border)" }}>
              <Clock className="mx-auto h-6 w-6 opacity-50" style={{ color: "var(--muted-foreground)" }} />
              <p className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>No snapshots yet</p>
            </div>
          )}
          {snapshots.map((s, i) => (
            <div key={s.id} className="flex items-center gap-2 rounded-lg border px-3 py-2" style={{ borderColor: "var(--border)", background: "var(--background)" }}>
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
                style={{ background: "color-mix(in srgb, var(--teal) 15%, transparent)", color: "var(--teal)" }}>{snapshots.length - i}</div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium" style={{ color: "var(--foreground)" }}>{s.name}</div>
                <div className="text-[10px]" style={{ color: "var(--muted-foreground)" }}>{new Date(s.createdAt).toLocaleString()} · {s.nodes.length} nodes · {s.edges.length} edges</div>
              </div>
              <button onClick={() => handleRestore(s)} title="Restore" className="flex h-6 w-6 items-center justify-center rounded hover:bg-accent" style={{ color: "var(--teal)" }}><RotateCcw className="h-3 w-3" /></button>
              <button onClick={() => handleDelete(s.id)} title="Delete" className="flex h-6 w-6 items-center justify-center rounded hover:bg-red-500/10" style={{ color: "var(--muted-foreground)" }}><Trash2 className="h-3 w-3" /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
