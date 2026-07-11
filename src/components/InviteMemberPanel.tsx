import { useState, useCallback } from "react";
import { UserPlus, X, Shield, Pencil, Eye, Mail, Loader as Loader2, CircleAlert as AlertCircle, CircleCheck as CheckCircle2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { DbRole } from "@/hooks/useAccessControl";

export interface ProjectMember {
  id: string;
  email: string;
  role: DbRole;
  user_id: string;
}

interface InviteMemberPanelProps {
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
  onMemberAdded?: () => void;
}

const ROLE_OPTIONS: Array<{ value: DbRole; label: string; icon: typeof Shield; description: string }> = [
  { value: "ADMIN", label: "Admin", icon: Shield, description: "Full access — create, edit, delete, manage members" },
  { value: "EDITOR", label: "Editor", icon: Pencil, description: "Read & write — create and edit nodes, no deletion" },
  { value: "VIEWER", label: "Viewer", icon: Eye, description: "Read-only — view canvas, add comments only" },
];

export function InviteMemberPanel({ projectId, isOpen, onClose, onMemberAdded }: InviteMemberPanelProps) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<DbRole>("VIEWER");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleInvite = useCallback(async () => {
    const trimmed = email.trim();
    if (!trimmed || !trimmed.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const { data: userData, error: userError } = await supabase
        .from("auth.users")
        .select("id, email")
        .eq("email", trimmed.toLowerCase())
        .maybeSingle();

      if (userError) throw userError;

      if (!userData) {
        setError(`No user found with email "${trimmed}". They must sign up first.`);
        return;
      }

      const { error: insertError } = await supabase
        .from("project_members")
        .insert({
          project_id: projectId,
          user_id: userData.id,
          email: userData.email,
          role,
        });

      if (insertError) {
        if (insertError.code === "23505") {
          setError("This user is already a member of the project.");
        } else {
          throw insertError;
        }
        return;
      }

      setSuccess(`${userData.email} added as ${role}.`);
      setEmail("");
      onMemberAdded?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add member.");
    } finally {
      setSubmitting(false);
    }
  }, [email, role, projectId, onMemberAdded]);

  if (!isOpen) return null;

  return (
    <div className="fixed right-4 top-20 z-50 w-[380px] rounded-3xl border border-border bg-popover/95 p-5 shadow-2xl backdrop-blur-xl">
      <div className="mb-4 flex items-start justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal/10">
            <UserPlus className="h-4 w-4 text-teal" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Invite Member</h3>
            <p className="text-[11px] text-muted-foreground">Add a collaborator to this project</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg border border-border bg-background p-2 text-muted-foreground transition hover:border-teal hover:text-teal"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Email input */}
      <div className="mb-4">
        <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Email Address
        </label>
        <div className="relative">
          <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="collaborator@example.com"
            className="w-full rounded-xl border border-border bg-background py-2.5 pl-10 pr-3 text-sm text-foreground outline-none transition focus:border-teal"
            disabled={submitting}
          />
        </div>
      </div>

      {/* Role selector */}
      <div className="mb-4">
        <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Role
        </label>
        <div className="space-y-2">
          {ROLE_OPTIONS.map(({ value, label, icon: Icon, description }) => (
            <button
              key={value}
              onClick={() => setRole(value)}
              disabled={submitting}
              className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-all ${
                role === value
                  ? "border-teal bg-teal/10"
                  : "border-border bg-background hover:border-teal/40"
              }`}
            >
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                  role === value ? "bg-teal/20 text-teal" : "bg-surface text-muted-foreground"
                }`}
              >
                <Icon className="h-4 w-4" />
              </div>
              <div className="flex-1">
                <div className={`text-sm font-semibold ${role === value ? "text-teal" : "text-foreground"}`}>
                  {label}
                </div>
                <div className="text-[11px] text-muted-foreground">{description}</div>
              </div>
              <div
                className={`mt-1 h-4 w-4 shrink-0 rounded-full border-2 transition ${
                  role === value ? "border-teal bg-teal" : "border-border"
                }`}
              />
            </button>
          ))}
        </div>
      </div>

      {/* Error / success messages */}
      {error && (
        <div className="mb-3 flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="mb-3 flex items-start gap-2 rounded-xl border border-green-500/30 bg-green-500/10 p-3 text-xs text-green-500">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* Invite button */}
      <button
        onClick={handleInvite}
        disabled={submitting || !email.trim()}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-teal px-4 py-2.5 text-sm font-semibold text-teal-foreground transition hover:bg-teal/90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Sending invite...
          </>
        ) : (
          <>
            <UserPlus className="h-4 w-4" />
            Add Member
          </>
        )}
      </button>

      <p className="mt-3 text-center text-[10px] text-muted-foreground">
        The user must have an existing account. They will appear in the project's member list immediately.
      </p>
    </div>
  );
}
