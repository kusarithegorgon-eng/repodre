/**
 * Stripe checkout client — creates a Checkout Session by calling the
 * /stripe-checkout edge function, then redirects the browser to Stripe.
 */

import { supabase } from "./supabase";

export async function startProCheckout(successUrl?: string, cancelUrl?: string): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    throw new Error("Authentication required to upgrade to Pro");
  }

  const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-checkout`;
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      success_url: successUrl,
      cancel_url: cancelUrl,
    }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `Checkout failed (${response.status})`);
  }

  const body = await response.json().catch(() => ({}));
  if (typeof body.url === "string") {
    window.location.href = body.url;
  } else {
    throw new Error("Stripe did not return a checkout URL");
  }
}
