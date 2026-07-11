import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface NodeUpdatePayload {
  projectId: string;
  nodeId: string;
  updates: Record<string, unknown>;
}

interface BatchPositionPayload {
  projectId: string;
  updates: Array<{ id: string; x: number; y: number }>;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing Authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    // Create a user-scoped client to extract the JWT subject
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();

    // Route based on action field
    const action = body.action as string | undefined;

    // ---- VERIFY ROLE ----
    // Check if user is the project owner OR a member with sufficient role
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: project } = await serviceClient
      .from("projects")
      .select("user_id")
      .eq("id", body.projectId)
      .maybeSingle();

    let dbRole: string | null = null;

    if (project?.user_id === user.id) {
      // Project owner is always ADMIN
      dbRole = "ADMIN";
    } else {
      const { data: member } = await serviceClient
        .from("project_members")
        .select("role")
        .eq("project_id", body.projectId)
        .eq("user_id", user.id)
        .maybeSingle();
      dbRole = member?.role ?? null;
    }

    if (!dbRole) {
      return new Response(
        JSON.stringify({ error: "You are not a member of this project" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ---- ENFORCE PERMISSIONS ----
    // VIEWER: cannot modify anything
    // EDITOR: can update nodes (position, label) but cannot delete
    // ADMIN: full access
    const isViewer = dbRole === "VIEWER";
    const isEditor = dbRole === "EDITOR";
    const isAdmin = dbRole === "ADMIN";

    if (action === "updateNode") {
      if (isViewer) {
        return new Response(
          JSON.stringify({ error: "Viewers cannot update nodes" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const payload = body as NodeUpdatePayload;
      const { error } = await serviceClient
        .from("nodes")
        .update({ ...payload.updates, updated_at: new Date().toISOString() })
        .eq("id", payload.nodeId)
        .eq("project_id", payload.projectId);

      if (error) {
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, nodeId: payload.nodeId }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "batchUpdatePositions") {
      if (isViewer) {
        return new Response(
          JSON.stringify({ error: "Viewers cannot update node positions" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const payload = body as BatchPositionPayload;
      const updates = payload.updates.map((u) => ({
        id: u.id,
        x: u.x,
        y: u.y,
        updated_at: new Date().toISOString(),
      }));

      // Update each node — verify project_id matches
      const results = await Promise.all(
        updates.map((u) =>
          serviceClient
            .from("nodes")
            .update({ x: u.x, y: u.y, updated_at: u.updated_at })
            .eq("id", u.id)
            .eq("project_id", payload.projectId)
        )
      );

      const errors = results.filter((r) => r.error);
      if (errors.length > 0) {
        return new Response(
          JSON.stringify({ error: errors[0].error!.message, partial: true }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, count: updates.length }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "deleteNode") {
      if (!isAdmin) {
        return new Response(
          JSON.stringify({ error: "Only admins can delete nodes" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const payload = body as NodeUpdatePayload;
      const { error } = await serviceClient
        .from("nodes")
        .delete()
        .eq("id", payload.nodeId)
        .eq("project_id", payload.projectId);

      if (error) {
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, nodeId: payload.nodeId }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: `Unknown action: ${action}` }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
