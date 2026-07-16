import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

type Role = "admin" | "editor" | "viewer";
type Action = "view" | "create" | "update" | "delete" | "comment" | "manage";
type Resource = "project" | "node" | "edge" | "annotation" | "presence" | "comment";

const POLICY: Record<Role, Record<Resource, Action[]>> = {
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

function can(role: Role, action: Action, resource: Resource): boolean {
  return POLICY[role]?.[resource]?.includes(action) ?? false;
}

function normalizeRole(raw: string | null | undefined): Role {
  const r = (raw ?? "").toLowerCase();
  if (r === "admin" || r === "editor" || r === "viewer") return r;
  return "viewer";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ allowed: false, reason: "missing auth header" }, 401);
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData.user) {
      return json({ allowed: false, reason: "invalid token" }, 401);
    }
    const userId = userData.user.id;

    const body = await req.json();
    const projectId: string | undefined = body.projectId;
    const resource: Resource = body.resource;
    const action: Action = body.action;

    if (!projectId || !resource || !action) {
      return json({ allowed: false, reason: "missing projectId, resource, or action" }, 400);
    }

    // Look up the user's role in project_members
    const { data: membership, error: memberErr } = await supabase
      .from("project_members")
      .select("role")
      .eq("project_id", projectId)
      .eq("user_id", userId)
      .maybeSingle();

    let role: Role;
    if (memberErr || !membership) {
      // Fall back to project owner check
      const { data: project } = await supabase
        .from("projects")
        .select("user_id")
        .eq("id", projectId)
        .maybeSingle();

      if (project?.user_id === userId) {
        role = "admin";
      } else {
        return json({ allowed: false, reason: "not a member of this project" }, 403);
      }
    } else {
      role = normalizeRole(membership.role);
    }

    const allowed = can(role, action, resource);
    return json({ allowed, role, resource, action, reason: allowed ? "allowed" : "denied by role policy" }, allowed ? 200 : 403);
  } catch (err) {
    return json({ allowed: false, reason: err.message }, 500);
  }
});

function json(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
