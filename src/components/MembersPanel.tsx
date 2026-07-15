import { useState, useEffect, useCallback } from "react";
import { Users, UserPlus, Trash2, Shield, Pencil, Eye, Mail, Clock, X, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface ProjectMember { id: string; email: string; role: string; }
interface ProjectInvitation { id: string; email: string; role: string; status: string; }

interface MembersPanelProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
}

export function MembersPanel({ isOpen, onClose, projectId }: MembersPanelProps) {
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [invitations, setInvitations] = useState<ProjectInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"EDITOR" | "VIEWER">("EDITOR");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [m, i] = await Promise.all([
        supabase.from("project_members").select("*").eq("project_id", projectId),
        supabase.from("project_invitations").select("*").eq("project_id", projectId),
      ]);
      setMembers((m.data ?? []) as ProjectMember[]);
      setInvitations((i.data ?? []) as ProjectInvitation[]);
    } catch (err) { setError(err instanceof Error ? err.message : "Failed to load"); }
    finally { setLoading(false); }
  }, [projectId]);

  useEffect(() => { if (isOpen) load(); }, [isOpen, load]);

  const handleInvite = async () => {
    const email = inviteEmail.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError("Enter a valid email"); return; }
    setSubmitting(true); setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error: err } = await supabase.from("project_invitations")
        .insert({ project_id: projectId, email, role: inviteRole, invited_by: user?.id ?? null });
      if (err) throw err;
      setInviteEmail(""); await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to invite";
      setError(msg.includes("duplicate") || msg.includes("unique") ? "Invitation already exists" : msg);
    } finally { setSubmitting(false); }
  };

  const handleRemove = async (id: string) => {
    try { await supabase.from("project_members").delete().eq("id", id); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "Failed"); }
  };

  const handleCancel = async (id: string) => {
    try { await supabase.from("project_invitations").delete().eq("id", id); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "Failed"); }
  };

  if (!isOpen) return null;

  return (
    <div className="absolute left-4 top-4 z-50 w-80 rounded-xl border p-4 shadow-2xl backdrop-blur"
      style={{ background: "color-mix(in srgb, var(--popover) 95%, transparent)", borderColor: "var(--border)" }}>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4" style={{ color: "var(--teal)" }} />
          <h3 className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>Team Members</h3>
        </div>
        <button onClick={onClose} className="flex h-6 w-6 items-center justify-center rounded hover:bg-accent" style={{ color: "var(--muted-foreground)" }}><X className="h-4 w-4" /></button>
      </div>

      {error && <div className="mb-3 rounded-lg border px-3 py-2 text-xs" style={{ borderColor: "color-mix(in srgb, var(--red) 30%, transparent)", color: "var(--red)" }}>{error}</div>}

      <div className="mb-4 rounded-lg border p-3" style={{ borderColor: "var(--border)", background: "var(--background)" }}>
        <div className="mb-2 flex items-center gap-1.5 text-xs font-medium" style={{ color: "var(--foreground)" }}>
          <UserPlus className="h-3.5 w-3.5" style={{ color: "var(--teal)" }} /> Invite by Email
        </div>
        <div className="flex gap-1.5">
          <input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleInvite()} placeholder="teammate@example.com"
            className="flex-1 rounded-md border px-2.5 py-1.5 text-xs outline-none focus:border-teal" style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--foreground)" }} disabled={submitting} />
          <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as "EDITOR" | "VIEWER")} className="rounded-md border px-1.5 py-1.5 text-xs outline-none" style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--foreground)" }} disabled={submitting}>
            <option value="EDITOR">Editor</option><option value="VIEWER">Viewer</option>
          </select>
        </div>
        <button onClick={handleInvite} disabled={submitting || !inviteEmail.trim()} className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-white transition-all hover:opacity-90 disabled:opacity-40" style={{ background: "var(--teal)" }}>
          {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Mail className="h-3.5 w-3.5" /> Send Invitation</>}
        </button>
        <p className="mt-1.5 text-[10px]" style={{ color: "var(--muted-foreground)" }}>They'll get access when they sign in with this email.</p>
      </div>

      {loading ? <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" style={{ color: "var(--muted-foreground)" }} /></div> : (
        <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
          {members.map((m) => (
            <div key={m.id} className="flex items-center gap-2 rounded-lg border px-2.5 py-2" style={{ borderColor: "var(--border)", background: "var(--background)" }}>
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold" style={{ background: "color-mix(in srgb, var(--teal) 20%, transparent)", color: "var(--teal)" }}>{m.email.charAt(0).toUpperCase()}</div>
              <div className="min-w-0 flex-1"><div className="truncate text-xs font-medium" style={{ color: "var(--foreground)" }}>{m.email}</div><div className="flex items-center gap-1 text-[10px]" style={{ color: "var(--muted-foreground)" }}>{m.role === "ADMIN" && <Shield className="h-2.5 w-2.5" />}{m.role === "EDITOR" && <Pencil className="h-2.5 w-2.5" />}{m.role === "VIEWER" && <Eye className="h-2.5 w-2.5" />}{m.role.toLowerCase()}</div></div>
              <button onClick={() => handleRemove(m.id)} className="flex h-6 w-6 items-center justify-center rounded hover:bg-red-500/10" style={{ color: "var(--muted-foreground)" }}><Trash2 className="h-3 w-3" /></button>
            </div>
          ))}
          {invitations.length > 0 && (
            <div className="pt-2"><div className="mb-1.5 flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide" style={{ color: "var(--muted-foreground)" }}><Clock className="h-3 w-3" /> Pending Invitations</div>
              {invitations.map((inv) => (
                <div key={inv.id} className="flex items-center gap-2 rounded-lg border border-dashed px-2.5 py-2" style={{ borderColor: "var(--border)", background: "color-mix(in srgb, var(--background) 50%, transparent)" }}>
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full" style={{ background: "color-mix(in srgb, var(--orange) 15%, transparent)", color: "var(--orange)" }}><Clock className="h-3.5 w-3.5" /></div>
                  <div className="min-w-0 flex-1"><div className="truncate text-xs font-medium" style={{ color: "var(--foreground)" }}>{inv.email}</div><div className="text-[10px]" style={{ color: "var(--muted-foreground)" }}>{inv.role.toLowerCase()} · awaiting sign-in</div></div>
                  <button onClick={() => handleCancel(inv.id)} className="flex h-6 w-6 items-center justify-center rounded hover:bg-red-500/10" style={{ color: "var(--muted-foreground)" }}><X className="h-3 w-3" /></button>
                </div>
              ))}
            </div>
          )}
          {members.length === 0 && invitations.length === 0 && <div className="rounded-lg border border-dashed p-4 text-center" style={{ borderColor: "var(--border)" }}><UserPlus className="mx-auto h-6 w-6 opacity-50" style={{ color: "var(--muted-foreground)" }} /><p className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>No members yet</p></div>}
        </div>
      )}
    </div>
  );
}
