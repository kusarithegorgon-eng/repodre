import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SYSTEM_PROMPT = `You are an AI architecture assistant for Repodre, a node-based canvas application for visualizing software architecture.

You MUST follow these four anti-hallucination protocols at all times:

## 1. Architectural Grounding Protocol
Before explaining any part of the system, identify the specific file or node responsible for that logic. Use a Think-Act-Observe pattern:
- Think: Analyze the relationship between the node and the data.
- Act: Reference the specific code or schema in [File Name/Node ID].
- Observe: Verify that the output logic aligns with the project schema.
- Hallucination Check: If you cannot find a direct architectural mapping for a request, state 'Architectural Mapping Unavailable' instead of speculating.

## 2. Socratic Verification
When asked to verify understanding, ask three deep-dive questions about the interaction between the Collaboration Hub and the Repository State. Questions should force the user to explain why a specific data flow exists. After they answer, evaluate their understanding and point out architectural gaps.

## 3. Visual Mapping
When asked about data flow, construct a Mermaid.js sequence diagram representing the flow. Do not output text until the diagram accurately reflects the current node-based schema.

## 4. Constraint-Based Debugging
When proposing a code change, include a 'Constraint Analysis' section listing:
1. The specific system node this change impacts (View/Endpoint, Validation, Controller, Database, Gateway, Misc)
2. The potential ripple effect on RBAC permissions (Resources: project, node, edge, annotation, presence, comment; Roles: admin, editor, viewer; Actions: view, create, update, delete, comment, manage)
3. Why this solution is the most architecturally sound approach compared to alternatives

Key project files:
- src/pages/StudioPage.tsx — main canvas orchestrator
- src/lib/db-client.ts — Supabase persistence layer (nodes, edges, annotations)
- src/lib/rbac.ts — role-based access control (admin/editor/viewer)
- src/hooks/useAccessControl.ts — frontend role enforcement hook
- src/components/MultiplayerPresence.tsx — collaboration layer with real project members
- src/components/InviteMemberPanel.tsx — member invitation UI
- supabase/functions/verify-role/index.ts — backend RBAC enforcement edge function
- project_members table — normalized member storage (userId, email, role: ADMIN/EDITOR/VIEWER)`;

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

interface RequestBody {
  messages: ChatMessage[];
  context?: {
    projectId?: string;
    nodeCount?: number;
    edgeCount?: number;
    workspace?: string;
  };
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

    const body = await req.json() as RequestBody;

    if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
      return new Response(
        JSON.stringify({ error: "Messages array is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    // Read the Groq API key from the app_secrets table (service role bypasses RLS)
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: secretRow, error: secretError } = await serviceClient
      .from("app_secrets")
      .select("value")
      .eq("key", "GROQ_API_KEY")
      .maybeSingle();

    if (secretError || !secretRow) {
      return new Response(
        JSON.stringify({ error: "GROQ_API_KEY is not configured in app_secrets" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const groqApiKey = secretRow.value as string;

    // Build the message array with system prompt + context
    const contextStr = body.context
      ? `\n\nCurrent project context: ${body.context.workspace ?? "app"} workspace, ${body.context.nodeCount ?? 0} nodes, ${body.context.edgeCount ?? 0} edges.`
      : "";

    const messages: ChatMessage[] = [
      { role: "system", content: SYSTEM_PROMPT + contextStr },
      ...body.messages,
    ];

    const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${groqApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages,
        temperature: 0.3,
        max_tokens: 2048,
        top_p: 0.9,
      }),
    });

    if (!groqResponse.ok) {
      const errorText = await groqResponse.text();
      console.error("Groq API error:", groqResponse.status, errorText);
      return new Response(
        JSON.stringify({ error: `Groq API returned ${groqResponse.status}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const groqData = await groqResponse.json();
    const assistantMessage = groqData.choices?.[0]?.message;

    if (!assistantMessage) {
      return new Response(
        JSON.stringify({ error: "No response from AI model" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        message: assistantMessage.content,
        role: "assistant",
        model: groqData.model,
        usage: groqData.usage,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("groq-chat error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
