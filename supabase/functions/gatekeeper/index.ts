import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface GatekeeperRequest {
  projectId: string;
  action: "node.create" | "node.update" | "node.delete" | "edge.create" | "edge.update" | "edge.delete";
  payload?: Record<string, unknown>;
}

type Role = "ADMIN" | "EDITOR" | "VIEWER";

const WRITE_ACTIONS = new Set<GatekeeperRequest["action"]>([
  "node.create",
  "node.update",
  "edge.create",
  "edge.update",
]);

const ADMIN_ACTIONS = new Set<GatekeeperRequest["action"]>([
  "node.delete",
  "edge.delete",
]);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body: GatekeeperRequest = await req.json();
    const { projectId, action } = body;

    if (!projectId || !action) {
      return new Response(
        JSON.stringify({ error: "Missing projectId or action" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: membership, error: memberError } = await supabase
      .from("project_members")
      .select("role")
      .eq("project_id", projectId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (memberError) {
      return new Response(
        JSON.stringify({ error: "Failed to verify project membership" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!membership) {
      return new Response(
        JSON.stringify({ error: "Not a member of this project", role: null, action }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const role = membership.role as Role;

    if (ADMIN_ACTIONS.has(action) && role !== "ADMIN") {
      return new Response(
        JSON.stringify({ error: "Admin role required for this action", role, action }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (WRITE_ACTIONS.has(action) && role === "VIEWER") {
      return new Response(
        JSON.stringify({ error: "Viewers cannot modify project data", role, action }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ authorized: true, role, action }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
