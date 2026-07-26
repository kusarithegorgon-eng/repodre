/**
 * Stripe Checkout Edge Function
 *
 * Creates a Stripe Checkout Session for the Pro subscription tier.
 * Called from the frontend when a user clicks "Upgrade to Pro".
 *
 * POST /functions/v1/stripe-checkout
 *   Authorization: Bearer <user_jwt>
 *   { "success_url": "...", "cancel_url": "..." }
 *
 * Returns:
 *   200 { url: "https://checkout.stripe.com/..." }
 *   401 — not authenticated
 *   500 — Stripe error
 */

import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import Stripe from "npm:stripe@14.21.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const PRO_PRICE_ID = "price_pro_monthly";
const PRO_PRICE_AMOUNT = 500; // $5.00/month in cents

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
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
    const successUrl = body.success_url ?? `${req.headers.get("origin")}/dashboard?upgrade=success`;
    const cancelUrl = body.cancel_url ?? `${req.headers.get("origin")}/dashboard?upgrade=cancelled`;

    const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeSecret) {
      return new Response(
        JSON.stringify({ error: "Stripe not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const stripe = new Stripe(stripeSecret);

    // Look up or create the Stripe customer for this user
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { data: sub } = await serviceClient
      .from("user_subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();

    let customerId = sub?.stripe_customer_id ?? undefined;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;
      await serviceClient
        .from("user_subscriptions")
        .update({ stripe_customer_id: customerId })
        .eq("user_id", user.id);
    }

    // Try to use a configured Price ID; fall back to inline price
    let lineItem: Stripe.Checkout.SessionCreateParams.LineItem;
    try {
      const price = await stripe.prices.retrieve(PRO_PRICE_ID);
      lineItem = { price: price.id, quantity: 1 };
    } catch {
      lineItem = {
        price_data: {
          currency: "usd",
          unit_amount: PRO_PRICE_AMOUNT,
          recurring: { interval: "month" },
          product_data: { name: "RepoDre Pro" },
        },
        quantity: 1,
      };
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [lineItem],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: { supabase_user_id: user.id },
      subscription_data: { metadata: { supabase_user_id: user.id } },
    });

    return new Response(
      JSON.stringify({ url: session.url }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
