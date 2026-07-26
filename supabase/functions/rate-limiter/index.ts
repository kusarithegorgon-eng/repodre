/**
 * Rate-Limiter Edge Function
 *
 * Token-bucket rate limiter backed by the `rate_limit_buckets` Postgres table.
 * Enforces tiered limits:
 *   - Free tier: 5 repo imports per hour
 *   - Pro tier: 10000 per hour (effectively unlimited)
 *
 * Returns:
 *   200 { allowed: true, remaining, tier } — action is allowed
 *   429 { allowed: false, retryAfter, tier } — rate limit exceeded
 *   401 — not authenticated
 *
 * Usage from the frontend:
 *   POST /functions/v1/rate-limiter
 *   { "action": "repo_import" }
 *   Authorization: Bearer <user_jwt>
 */

import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const TIER_CONFIG = {
  free: { capacity: 5, refill_rate: 5 / 3600 }, // 5 per hour
  pro: { capacity: 10000, refill_rate: 10000 / 3600 }, // effectively unlimited
} as const;

interface RateLimitRow {
  id: string;
  user_id: string;
  action: string;
  tokens: number;
  capacity: number;
  refill_rate: number;
  last_refill: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    // Create a Supabase client with the caller's JWT to identify the user
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Authentication required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = await req.json().catch(() => ({}));
    const action: string = body.action ?? "repo_import";
    if (!action || typeof action !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing 'action' field" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Determine the user's tier ────────────────────────────────────
    // Use the service-role client for subscription + bucket lookups so RLS
    // on rate_limit_buckets (service-role-only mutations) works.
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { data: sub } = await serviceClient
      .from("user_subscriptions")
      .select("tier, status")
      .eq("user_id", user.id)
      .maybeSingle();

    const tier = sub?.status === "active" && sub?.tier === "pro" ? "pro" : "free";
    const config = TIER_CONFIG[tier];

    // ── Token bucket logic ───────────────────────────────────────────
    const { data: existing } = await serviceClient
      .from("rate_limit_buckets")
      .select("*")
      .eq("user_id", user.id)
      .eq("action", action)
      .maybeSingle() as { data: RateLimitRow | null };

    const now = Date.now();

    if (!existing) {
      // Create a new bucket at full capacity
      const { error: insertErr } = await serviceClient
        .from("rate_limit_buckets")
        .insert({
          user_id: user.id,
          action,
          tokens: config.capacity - 1,
          capacity: config.capacity,
          refill_rate: config.refill_rate,
          last_refill: new Date(now).toISOString(),
        });

      if (insertErr) {
        return new Response(
          JSON.stringify({ error: "Failed to initialize rate limit bucket" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Log usage
      await serviceClient.from("usage_events").insert({
        user_id: user.id,
        action,
        metadata: { tier, remaining: config.capacity - 1 },
      });

      return new Response(
        JSON.stringify({ allowed: true, remaining: config.capacity - 1, tier }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Refill tokens based on elapsed time
    const lastRefillMs = new Date(existing.last_refill).getTime();
    const elapsedSec = Math.max(0, (now - lastRefillMs) / 1000);
    const refilled = Math.min(
      existing.capacity,
      Number(existing.tokens) + elapsedSec * Number(existing.refill_rate),
    );

    if (refilled < 1) {
      // Rate limited — not enough tokens
      const retryAfterSec = Math.ceil((1 - refilled) / Number(existing.refill_rate));
      return new Response(
        JSON.stringify({
          allowed: false,
          retryAfter: retryAfterSec,
          tier,
          message: `Rate limit exceeded for ${action}. Try again in ${retryAfterSec}s.`,
        }),
        {
          status: 429,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
            "Retry-After": String(retryAfterSec),
          },
        },
      );
    }

    // Decrement a token and persist
    const newTokens = refilled - 1;
    await serviceClient
      .from("rate_limit_buckets")
      .update({
        tokens: newTokens,
        capacity: config.capacity,
        refill_rate: config.refill_rate,
        last_refill: new Date(now).toISOString(),
      })
      .eq("id", existing.id);

    // Log usage
    await serviceClient.from("usage_events").insert({
      user_id: user.id,
      action,
      metadata: { tier, remaining: newTokens },
    });

    return new Response(
      JSON.stringify({ allowed: true, remaining: newTokens, tier }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
