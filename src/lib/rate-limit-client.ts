/**
 * Rate-limiter client — calls the /rate-limiter edge function to check
 * whether the current user is allowed to perform a rate-limited action
 * (e.g. repository import). Returns the allowed/remaining/tier status or
 * a 429 retry-after indicator.
 */

import { supabase } from "./supabase";

export interface RateLimitResult {
  allowed: boolean;
  remaining?: number;
  tier?: "free" | "pro";
  retryAfter?: number;
  message?: string;
}

export async function checkRateLimit(action: string): Promise<RateLimitResult> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return { allowed: false, message: "Authentication required" };
  }

  const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/rate-limiter`;
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action }),
  });

  if (response.status === 429) {
    const body = await response.json().catch(() => ({}));
    return {
      allowed: false,
      retryAfter: body.retryAfter ?? 60,
      tier: body.tier,
      message: body.message ?? "Rate limit exceeded. Please upgrade to Pro for unlimited imports.",
    };
  }

  if (!response.ok) {
    return { allowed: false, message: `Rate check failed (${response.status})` };
  }

  const body = await response.json().catch(() => ({}));
  return {
    allowed: body.allowed ?? true,
    remaining: body.remaining,
    tier: body.tier,
  };
}
