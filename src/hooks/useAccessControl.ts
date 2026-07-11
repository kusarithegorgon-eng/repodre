import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { Role } from "@/lib/rbac";
import type { User } from "@supabase/supabase-js";

export type DbRole = "ADMIN" | "EDITOR" | "VIEWER";

const DB_TO_APP: Record<DbRole, Role> = {
  ADMIN: "admin",
  EDITOR: "editor",
  VIEWER: "viewer",
};

export interface AccessControlState {
  role: Role;
  loading: boolean;
  error: string | null;
  canEdit: boolean;
  canDelete: boolean;
  canManage: boolean;
  isViewer: boolean;
}

/**
 * Reusable access-control hook. Pass a projectId and the current user.
 * Returns the user's role for that project plus derived permission flags.
 *
 * Viewers get canEdit=false, canDelete=false. Editors get canEdit=true but
 * canDelete=false. Admins get everything.
 *
 * The hook queries project_members on mount and when projectId/user changes.
 * It does NOT subscribe to realtime changes — role changes require a page
 * refresh or explicit re-fetch to take effect, which is intentional: you don't
 * want a user mid-edit to suddenly lose permissions without clear feedback.
 */
export function useAccessControl(
  projectId: string | null | undefined,
  user: User | null
): AccessControlState {
  const [state, setState] = useState<AccessControlState>({
    role: "viewer",
    loading: true,
    error: null,
    canEdit: false,
    canDelete: false,
    canManage: false,
    isViewer: true,
  });

  const fetchRole = useCallback(async () => {
    if (!projectId || !user) {
      setState({
        role: "viewer",
        loading: false,
        error: null,
        canEdit: false,
        canDelete: false,
        canManage: false,
        isViewer: true,
      });
      return;
    }

    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      // Check if user is the project owner first
      const { data: project, error: projError } = await supabase
        .from("projects")
        .select("user_id")
        .eq("id", projectId)
        .maybeSingle();

      if (projError) throw projError;

      if (project?.user_id === user.id) {
        setState({
          role: "admin",
          loading: false,
          error: null,
          canEdit: true,
          canDelete: true,
          canManage: true,
          isViewer: false,
        });
        return;
      }

      // Otherwise check project_members
      const { data: member, error: memberError } = await supabase
        .from("project_members")
        .select("role")
        .eq("project_id", projectId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (memberError) throw memberError;

      const dbRole = (member?.role as DbRole | undefined) ?? "VIEWER";
      const role = DB_TO_APP[dbRole];

      setState({
        role,
        loading: false,
        error: null,
        canEdit: role === "admin" || role === "editor",
        canDelete: role === "admin",
        canManage: role === "admin",
        isViewer: role === "viewer",
      });
    } catch (err) {
      setState({
        role: "viewer",
        loading: false,
        error: err instanceof Error ? err.message : "Failed to load role",
        canEdit: false,
        canDelete: false,
        canManage: false,
        isViewer: true,
      });
    }
  }, [projectId, user]);

  useEffect(() => {
    fetchRole();
  }, [fetchRole]);

  return state;
}
