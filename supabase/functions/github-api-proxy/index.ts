// Follow the Supabase Functions quickstart on how to implement your functions
// https://supabase.com/docs/guides/functions

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

interface RequestBody {
  method: "GET" | "POST";
  endpoint: string;
  body?: Record<string, unknown>;
  token: string;
}

serve(async (req: Request) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*" } });
  }

  try {
    const { method, endpoint, body, token } = (await req.json()) as RequestBody;

    if (!token) {
      return new Response(
        JSON.stringify({
          ok: false,
          status: 401,
          error: "No GitHub token provided",
        }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Ensure endpoint starts with /
    const normalizedEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;

    // Make the actual GitHub API request
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
      JSON.stringify({
        ok: response.ok,
        status: response.status,
        data: data,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("GitHub API proxy error:", error);
    return new Response(
      JSON.stringify({
        ok: false,
        status: 500,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});
