import { useState, useEffect, useCallback } from "react";
import { Link2, Copy, Check, Trash2, Eye, Pencil, Globe, X, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface ProjectShare { id: string; access_level: string; }

interface ShareLinkPanelProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
}

export function ShareLinkPanel({ isOpen, onClose, projectId }: ShareLinkPanelProps) {
  const [share, setShare] = useState<ProjectShare | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { data, error } = await supabase.from("project_shares").select("*").eq("project_id", projectId).maybeSingle();
      if (error) throw error;
      setShare(data as ProjectShare | null);
    } catch (err) { setError(err instanceof Error ? err.message : "Failed"); }
    finally { setLoading(false); }
  }, [projectId]);

  useEffect(() => { if (isOpen) load(); }, [isOpen, load]);

  const shareUrl = share ? `${window.location.origin}/?share=${share.id}` : null;

  const handleCreate = async (accessLevel: "view" | "edit") => {
    setSubmitting(true); setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase.from("project_shares").insert({ project_id: projectId, access_level: accessLevel, created_by: user?.id ?? null }).select().single();
      if (error) throw error;
      setShare(data as ProjectShare);
    } catch (err) { setError(err instanceof Error ? err.message : "Failed"); }
    finally { setSubmitting(false); }
  };

  const handleAccessChange = async (accessLevel: "view" | "edit") => {
    if (!share) return;
    setSubmitting(true); setError(null);
    try {
      const { error } = await supabase.from("project_shares").update({ access_level: accessLevel }).eq("id", share.id);
      if (error) throw error;
      setShare({ ...share, access_level: accessLevel });
    } catch (err) { setError(err instanceof Error ? err.message : "Failed"); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async () => {
    if (!share) return;
    setSubmitting(true); setError(null);
    try {
      const { error } = await supabase.from("project_shares").delete().eq("id", share.id);
      if (error) throw error;
      setShare(null);
    } catch (err) { setError(err instanceof Error ? err.message : "Failed"); }
    finally { setSubmitting(false); }
  };

  const handleCopy = () => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="absolute left-4 top-4 z-50 w-80 rounded-xl border p-4 shadow-2xl backdrop-blur"
      style={{ background: "color-mix(in srgb, var(--popover) 95%, transparent)", borderColor: "var(--border)" }}>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link2 className="h-4 w-4" style={{ color: "var(--teal)" }} />
          <h3 className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>Share Link</h3>
        </div>
        <button onClick={onClose} className="flex h-6 w-6 items-center justify-center rounded hover:bg-accent" style={{ color: "var(--muted-foreground)" }}><X className="h-4 w-4" /></button>
      </div>

      {error && <div className="mb-3 rounded-lg border px-3 py-2 text-xs" style={{ borderColor: "color-mix(in srgb, var(--red) 30%, transparent)", color: "var(--red)" }}>{error}</div>}

      {loading ? <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" style={{ color: "var(--muted-foreground)" }} /></div> : !share ? (
        <div className="space-y-3">
          <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>Create a public link so anyone can access this flowchart without signing in.</p>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => handleCreate("view")} disabled={submitting} className="flex flex-col items-center gap-1.5 rounded-lg border p-3 text-xs font-medium transition-all hover:border-teal disabled:opacity-40" style={{ borderColor: "var(--border)", background: "var(--background)", color: "var(--foreground)" }}><Eye className="h-5 w-5" style={{ color: "var(--teal)" }} /> View Only</button>
            <button onClick={() => handleCreate("edit")} disabled={submitting} className="flex flex-col items-center gap-1.5 rounded-lg border p-3 text-xs font-medium transition-all hover:border-teal disabled:opacity-40" style={{ borderColor: "var(--border)", background: "var(--background)", color: "var(--foreground)" }}><Pencil className="h-5 w-5" style={{ color: "var(--teal)" }} /> Can Edit</button>
          </div>
        </div>
      ) : shareUrl ? (
        <div className="space-y-3">
          <div>
            <label className="mb-1 flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}><Globe className="h-3 w-3" /> Public Link</label>
            <div className="flex items-center gap-1">
              <input readOnly value={shareUrl} className="flex-1 truncate rounded-md border px-2.5 py-1.5 font-mono text-[10px] outline-none" style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--foreground)" }} onClick={(e) => (e.target as HTMLInputElement).select()} />
              <button onClick={handleCopy} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border transition-all hover:bg-accent" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>{copied ? <Check className="h-3.5 w-3.5" style={{ color: "var(--green)" }} /> : <Copy className="h-3.5 w-3.5" />}</button>
            </div>
          </div>
          <div>
            <label className="mb-1 text-[10px] font-medium uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}>Access Level</label>
            <div className="flex rounded-lg border p-0.5" style={{ borderColor: "var(--border)", background: "var(--background)" }}>
              <button onClick={() => handleAccessChange("view")} disabled={submitting} className="flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-all" style={share.access_level === "view" ? { background: "color-mix(in srgb, var(--teal) 15%, transparent)", color: "var(--teal)" } : { color: "var(--muted-foreground)" }}><Eye className="h-3.5 w-3.5" /> View Only</button>
              <button onClick={() => handleAccessChange("edit")} disabled={submitting} className="flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-all" style={share.access_level === "edit" ? { background: "color-mix(in srgb, var(--teal) 15%, transparent)", color: "var(--teal)" } : { color: "var(--muted-foreground)" }}><Pencil className="h-3.5 w-3.5" /> Can Edit</button>
            </div>
          </div>
          <div className="rounded-lg border px-3 py-2 text-[10px]" style={{ borderColor: "color-mix(in srgb, var(--teal) 20%, transparent)", background: "color-mix(in srgb, var(--teal) 5%, transparent)", color: "var(--muted-foreground)" }}>{share.access_level === "view" ? "Anyone with this link can view the flowchart but cannot make changes." : "Anyone with this link can view and edit the flowchart. Use with caution."}</div>
          <button onClick={handleDelete} disabled={submitting} className="flex w-full items-center justify-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-all hover:bg-red-500/10 disabled:opacity-40" style={{ borderColor: "color-mix(in srgb, var(--red) 30%, transparent)", color: "var(--red)" }}><Trash2 className="h-3.5 w-3.5" /> Remove Public Link</button>
        </div>
      ) : null}
    </div>
  );
}
