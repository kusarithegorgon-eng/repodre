/**
 * MultiplayerPresence — Real Collaborator Management Panel
 *
 * Invite collaborators by email with RBAC roles (ADMIN / EDITOR / VIEWER).
 * Lists current members and pending invitations, with role management.
 */

import { useState, useEffect, useCallback } from "react";
import {
  Users,
  UserPlus,
  Mail,
  Shield,
  Pencil,
  Eye,
  Trash2,
  X,
  Clock,
  Loader as Loader2,
  CircleAlert as AlertCircle,
  Crown,
} from "lucide-react";
import {
  listMembers,
  listInvitations,
  inviteCollaborator,
  revokeInvitation,
  updateMemberRole,
  removeMember,
  type ProjectMember,
  type ProjectInvitation,
  type ProjectRole,
} from "@/lib/db-client";

interface MultiplayerPresenceProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string | null;
}

const ROLE_ICONS: Record<ProjectRole, typeof Shield> = {
  ADMIN: Crown,
  EDITOR: Pencil,
  VIEWER: Eye,
};

const ROLE_COLORS: Record<ProjectRole, string> = {
  ADMIN: "text-amber-500",
  EDITOR: "text-teal",
  VIEWER: "text-muted-foreground",
};

export function MultiplayerPresence({ isOpen, onClose, projectId }: MultiplayerPresenceProps) {
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [invitations, setInvitations] = useState<ProjectInvitation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Invite form state
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<ProjectRole>("EDITOR");
  const [isSending, setIsSending] = useState(false);

  const fetchCollaborators = useCallback(async () => {
    if (!projectId) return;
    setIsLoading(true);
    setError(null);
    try {
      const [membs, invs] = await Promise.all([
        listMembers(projectId),
        listInvitations(projectId),
      ]);
      setMembers(membs);
      setInvitations(invs.filter((i) => i.status === "pending"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load collaborators");
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (isOpen && projectId) {
      fetchCollaborators();
    }
  }, [isOpen, projectId, fetchCollaborators]);

  const handleInvite = useCallback(async () => {
    if (!projectId || !inviteEmail.trim()) return;
    setIsSending(true);
    setError(null);
    try {
      await inviteCollaborator(projectId, inviteEmail, inviteRole);
      setInviteEmail("");
      await fetchCollaborators();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send invitation");
    } finally {
      setIsSending(false);
    }
  }, [projectId, inviteEmail, inviteRole, fetchCollaborators]);

  const handleRevoke = useCallback(
    async (invitationId: string) => {
      try {
        await revokeInvitation(invitationId);
        setInvitations((prev) => prev.filter((i) => i.id !== invitationId));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to revoke invitation");
      }
    },
    [],
  );

  const handleRoleChange = useCallback(
    async (memberId: string, role: ProjectRole) => {
      try {
        await updateMemberRole(memberId, role);
        setMembers((prev) => prev.map((m) => (m.id === memberId ? { ...m, role } : m)));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update role");
      }
    },
    [],
  );

  const handleRemoveMember = useCallback(
    async (memberId: string) => {
      try {
        await removeMember(memberId);
        setMembers((prev) => prev.filter((m) => m.id !== memberId));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to remove member");
      }
    },
    [],
  );

  if (!isOpen) return null;

  return (
    <div className="absolute right-4 top-16 z-50 w-80 rounded-xl border border-border bg-popover/97 p-4 shadow-2xl backdrop-blur-md">
      {/* Header */}
      <div className="mb-4 flex items-start justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal/10">
            <Users className="h-4 w-4 text-teal" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Collaborators</h3>
            <p className="text-[10px] text-muted-foreground">
              {members.length} member{members.length !== 1 ? "s" : ""}
              {invitations.length > 0 && ` · ${invitations.length} pending`}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-2.5 text-xs text-red-500">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="shrink-0 hover:text-red-400">
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Invite form */}
      <div className="mb-4 rounded-lg border border-border bg-background/50 p-3">
        <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-foreground">
          <UserPlus className="h-3.5 w-3.5 text-teal" />
          Invite by Email
        </div>
        <input
          type="email"
          value={inviteEmail}
          onChange={(e) => setInviteEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleInvite()}
          placeholder="collaborator@email.com"
          className="mb-2 w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal/30"
        />
        <div className="flex items-center gap-2">
          <RoleSelector value={inviteRole} onChange={setInviteRole} />
          <button
            onClick={handleInvite}
            disabled={!inviteEmail.trim() || isSending}
            className="flex items-center gap-1.5 rounded-md bg-teal px-3 py-1.5 text-xs font-medium text-white transition-all hover:bg-teal/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isSending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Mail className="h-3 w-3" />}
            Send Invite
          </button>
        </div>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Members list */}
      {!isLoading && (
        <div className="space-y-1.5">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Members
          </p>
          {members.map((member) => {
            const RoleIcon = ROLE_ICONS[member.role];
            return (
              <div
                key={member.id}
                className="group flex items-center gap-2.5 rounded-lg border border-border bg-background/40 px-2.5 py-2 transition-all hover:border-border/80"
              >
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal/15 text-[10px] font-bold text-teal">
                  {member.email.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-foreground">{member.email}</p>
                  <div className="flex items-center gap-1">
                    <RoleIcon className={`h-3 w-3 ${ROLE_COLORS[member.role]}`} />
                    <span className="text-[10px] text-muted-foreground">{member.role}</span>
                  </div>
                </div>
                {/* Role changer dropdown */}
                <select
                  value={member.role}
                  onChange={(e) => handleRoleChange(member.id, e.target.value as ProjectRole)}
                  className="rounded border border-border bg-background px-1 py-0.5 text-[10px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:border-teal/40 focus:outline-none"
                  title="Change role"
                >
                  <option value="ADMIN">Admin</option>
                  <option value="EDITOR">Editor</option>
                  <option value="VIEWER">Viewer</option>
                </select>
                {/* Remove button */}
                <button
                  onClick={() => handleRemoveMember(member.id)}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-all hover:bg-red-500/10 hover:text-red-500 group-hover:opacity-100"
                  title="Remove member"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Pending invitations */}
      {!isLoading && invitations.length > 0 && (
        <div className="mt-4 space-y-1.5">
          <p className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <Clock className="h-3 w-3" />
            Pending Invitations
          </p>
          {invitations.map((inv) => {
            const RoleIcon = ROLE_ICONS[inv.role];
            return (
              <div
                key={inv.id}
                className="group flex items-center gap-2.5 rounded-lg border border-dashed border-border bg-background/30 px-2.5 py-2"
              >
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-500/10 text-[10px] font-bold text-amber-500">
                  <Mail className="h-3 w-3" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-foreground">{inv.email}</p>
                  <div className="flex items-center gap-1">
                    <RoleIcon className={`h-3 w-3 ${ROLE_COLORS[inv.role]}`} />
                    <span className="text-[10px] text-muted-foreground">{inv.role}</span>
                    <span className="text-[10px] text-amber-500">· pending</span>
                  </div>
                </div>
                <button
                  onClick={() => handleRevoke(inv.id)}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-all hover:bg-red-500/10 hover:text-red-500 group-hover:opacity-100"
                  title="Revoke invitation"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* RBAC legend */}
      <div className="mt-4 border-t border-border pt-3">
        <div className="space-y-1 text-[10px] text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Crown className="h-3 w-3 text-amber-500" />
            <span><b className="text-foreground/80">Admin</b> — full access, can invite & remove</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Pencil className="h-3 w-3 text-teal" />
            <span><b className="text-foreground/80">Editor</b> — can edit nodes & edges</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Eye className="h-3 w-3 text-muted-foreground" />
            <span><b className="text-foreground/80">Viewer</b> — read-only access</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function RoleSelector({
  value,
  onChange,
}: {
  value: ProjectRole;
  onChange: (role: ProjectRole) => void;
}) {
  const roles: ProjectRole[] = ["ADMIN", "EDITOR", "VIEWER"];
  return (
    <div className="flex rounded-md border border-border bg-background p-0.5">
      {roles.map((r) => {
        const Icon = ROLE_ICONS[r];
        return (
          <button
            key={r}
            onClick={() => onChange(r)}
            title={`${r} role`}
            className={`flex items-center gap-1 rounded px-2 py-1 text-[10px] font-medium transition-all ${
              value === r
                ? "bg-teal/15 text-teal"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-3 w-3" />
            {r.charAt(0) + r.slice(1).toLowerCase()}
          </button>
        );
      })}
    </div>
  );
}

export function MultiplayerToggle({
  isActive,
  onClick,
  collaboratorCount,
  isConnected,
}: {
  isActive: boolean;
  onClick: () => void;
  collaboratorCount: number;
  isConnected: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-medium transition-all ${
        isActive
          ? "border-teal/50 bg-teal/10 text-teal"
          : "border-border bg-background text-muted-foreground hover:border-teal hover:text-teal"
      }`}
    >
      <Users className="h-3.5 w-3.5" />
      <span>Collaborators</span>
      {collaboratorCount > 0 && (
        <span
          className={`flex h-5 items-center gap-1 rounded-full px-1.5 text-[10px] font-semibold ${
            isConnected ? "bg-green-500/20 text-green-500" : "text-muted-foreground bg-surface"
          }`}
        >
          {collaboratorCount}
        </span>
      )}
    </button>
  );
}
