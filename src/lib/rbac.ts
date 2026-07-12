import { supabase } from "@/lib/supabase";

export type ProjectRole = "ADMIN" | "EDITOR" | "VIEWER";

export interface RoleAccess {
  role: ProjectRole | null;
  canRead: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canMove: boolean;
  canAdd: boolean;
  loading: boolean;
}

export async function fetchRole(projectId: string): Promise<ProjectRole | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("project_members")
    .select("role")
    .eq("project_id", projectId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !data) return null;
  return data.role as ProjectRole;
}

export async function validateAction(
  projectId: string,
  action: "node.create" | "node.update" | "node.delete" | "edge.create" | "edge.update" | "edge.delete",
): Promise<{ authorized: boolean; role: ProjectRole | null }> {
  const { data, error } = await supabase.functions.invoke("gatekeeper", {
    body: { projectId, action },
  });

  if (error || !data) {
    return { authorized: false, role: null };
  }

  return {
    authorized: data.authorized === true,
    role: data.role as ProjectRole | null,
  };
}

export function roleToAccess(role: ProjectRole | null, loading: boolean): RoleAccess {
  const isEditor = role === "EDITOR" || role === "ADMIN";
  const isAdmin = role === "ADMIN";
  return {
    role,
    canRead: true,
    canEdit: isEditor,
    canDelete: isAdmin,
    canMove: isEditor,
    canAdd: isEditor,
    loading,
  };
}
