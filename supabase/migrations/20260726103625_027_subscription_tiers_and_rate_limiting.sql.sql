/*
# Subscription Tiers, Rate Limiting & Usage Tracking

1. Purpose
   - `user_subscriptions`: tracks each user's plan tier (free/pro), billing status,
     and Stripe/PayMongo customer linkage.
   - `rate_limit_buckets`: token-bucket rate limiter stored in Postgres (durable
     store for the edge-function rate limiter, since edge instances share no memory).
   - `usage_events`: audit log of each rate-limited action (e.g. repo import).

2. New Tables
   - `user_subscriptions` — one row per user, tier free|pro, billing refs.
   - `rate_limit_buckets` — per-user, per-action token bucket (tokens, capacity, refill_rate).
   - `usage_events` — per-user action log with jsonb metadata.

3. Security (RLS)
   - `user_subscriptions`: owner-scoped CRUD (auth.uid() = user_id).
   - `rate_limit_buckets`: owner-scoped SELECT only; service role mutates.
   - `usage_events`: owner-scoped SELECT + INSERT.

4. Rate-limit semantics
   - Free: 5 repo imports/hour. Pro: effectively unlimited.
   - Edge function refills based on elapsed time, decrements a token, writes back.
*/

-- ── user_subscriptions ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_subscriptions (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tier text NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'pro')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'past_due', 'canceled')),
  stripe_customer_id text,
  stripe_subscription_id text,
  paymongo_customer_id text,
  current_period_end timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_subscription" ON user_subscriptions;
CREATE POLICY "select_own_subscription" ON user_subscriptions FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_subscription" ON user_subscriptions;
CREATE POLICY "insert_own_subscription" ON user_subscriptions FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_subscription" ON user_subscriptions;
CREATE POLICY "update_own_subscription" ON user_subscriptions FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── rate_limit_buckets ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rate_limit_buckets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action text NOT NULL,
  tokens numeric NOT NULL DEFAULT 0,
  capacity numeric NOT NULL,
  refill_rate numeric NOT NULL,
  last_refill timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, action)
);

ALTER TABLE rate_limit_buckets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_buckets" ON rate_limit_buckets;
CREATE POLICY "select_own_buckets" ON rate_limit_buckets FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

-- ── usage_events ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE usage_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_usage" ON usage_events;
CREATE POLICY "select_own_usage" ON usage_events FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_usage" ON usage_events;
CREATE POLICY "insert_own_usage" ON usage_events FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

-- ── Indexes ─────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_usage_events_user_created ON usage_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rate_limit_user_action ON rate_limit_buckets (user_id, action);

-- ── Auto-provision free subscription on signup ──────────────────────
CREATE OR REPLACE FUNCTION handle_new_user_subscription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO user_subscriptions (user_id, tier, status)
  VALUES (NEW.id, 'free', 'active')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_subscription ON auth.users;
CREATE TRIGGER on_auth_user_created_subscription
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user_subscription();
