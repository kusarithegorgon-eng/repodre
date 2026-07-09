import type { User } from "@supabase/supabase-js";

export type Role = "admin" | "editor" | "viewer";

export type Resource = "project" | "node" | "edge" | "annotation" | "presence" | "comment";
export type Action = "view" | "create" | "update" | "delete" | "comment" | "manage";

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  editor: "Editor",
  viewer: "Viewer",
};

export const ACCESS_CONTROL_MAP: Record<Resource, string> = {
  project: "Project metadata, zoom settings, workspace visibility",
  node: "Canvas nodes and visual entities",
  edge: "Graph connections and relationships",
  annotation: "Comments and annotations attached to node IDs",
  presence: "Real-time collaboration cursors and room membership",
  comment: "Textual discussion linked to specific canvas nodes",
};

const policyRules: Record<Role, Record<Resource, Action[]>> = {
  admin: {
    project: ["view", "create", "update", "delete"],
    node: ["view", "create", "update", "delete"],
    edge: ["view", "create", "update", "delete"],
    annotation: ["view", "create", "update", "delete"],
    presence: ["view", "manage"],
    comment: ["view", "create", "update", "delete"],
  },
  editor: {
    project: ["view", "create", "update"],
    node: ["view", "create", "update"],
    edge: ["view", "create", "update"],
    annotation: ["view", "create", "update"],
    presence: ["view", "manage"],
    comment: ["view", "create", "update"],
  },
  viewer: {
    project: ["view"],
    node: ["view"],
    edge: ["view"],
    annotation: ["view", "create"],
    presence: ["view"],
    comment: ["view", "create"],
  },
};

export interface PolicyRequest {
  role: Role;
  action: Action;
  resource: Resource;
  userId?: string;
  projectId?: string;
}

export interface PolicyResponse {
  allowed: boolean;
  role: Role;
  resource: Resource;
  action: Action;
  reason?: string;
}

export function can(role: Role, action: Action, resource: Resource): boolean {
  const allowedActions = policyRules[role]?.[resource] ?? [];
  return allowedActions.includes(action);
}

export function evaluatePolicy(request: PolicyRequest): PolicyResponse {
  const allowed = can(request.role, request.action, request.resource);
  return {
    allowed,
    role: request.role,
    action: request.action,
    resource: request.resource,
    reason: allowed ? "allowed" : "denied by role policy",
  };
}

export function enforce(role: Role, action: Action, resource: Resource): void {
  if (!can(role, action, resource)) {
    throw new Error(`Access denied: ${ROLE_LABELS[role]} cannot ${action} ${resource}`);
  }
}

export function getRoleFromMetadata(metadata: any): Role {
  if (!metadata || typeof metadata !== "object") return "viewer";
  const candidate = (metadata.role as string | undefined)?.toLowerCase();
  if (candidate === "admin" || candidate === "editor" || candidate === "viewer") {
    return candidate as Role;
  }
  return "viewer";
}

export function getRoleFromUser(user: User | null): Role {
  if (!user) return "viewer";
  const role = getRoleFromMetadata(user.user_metadata);
  return role;
}
