import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface RequestBody {
  method: "GET" | "POST";
  endpoint: string;
  body?: Record<string, unknown>;
  token: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { method, endpoint, body, token } = (await req.json()) as RequestBody;

    if (!token) {
      return new Response(
        JSON.stringify({ ok: false, status: 401, error: "No GitHub token provided" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const normalizedEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;

    const response = await fetch(`https://api.github.com${normalizedEndpoint}`, {
      method,
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "Repodre",
      },
      body: method === "POST" && body ? JSON.stringify(body) : undefined,
    });

    const data = await response.json();

    return new Response(
      JSON.stringify({ ok: response.ok, status: response.status, data }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("GitHub API proxy error:", error);
    return new Response(
      JSON.stringify({
        ok: false,
        status: 500,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
