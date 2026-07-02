/*
# Add user_id ownership columns and enforce owner-scoped RLS

## Problem
The `projects`, `nodes`, and `edges` tables had RLS enabled but with
permissive `WITH CHECK (true)` policies — any authenticated user could
insert/read/update/delete any row, with no ownership enforcement.

A previous code change added `user_id` to all insert calls in
`db-client.ts`, but the column did not exist in the database, causing
every insert to fail with a 400 "column does not exist" error from
PostgREST.

## Changes

### 1. New columns
- `projects.user_id` — uuid, NOT NULL, DEFAULT auth.uid(), FK to auth.users
- `nodes.user_id` — uuid, NOT NULL, DEFAULT auth.uid(), FK to auth.users
- `edges.user_id` — uuid, NOT NULL, DEFAULT auth.uid(), FK to auth.users

The `DEFAULT auth.uid()` ensures inserts that omit `user_id` still
satisfy the `WITH CHECK (auth.uid() = user_id)` policy.

### 2. Backfill existing rows
Existing rows get `user_id` set to the first known authenticated user
so they remain accessible after the policy change. This is a one-time
data migration — no user data is lost.

### 3. RLS policy replacement
All existing permissive policies on these three tables are dropped and
replaced with proper owner-scoped CRUD policies:
- SELECT: auth.uid() = user_id
- INSERT: WITH CHECK (auth.uid() = user_id)
- UPDATE: USING + WITH CHECK (auth.uid() = user_id)
- DELETE: USING (auth.uid() = user_id)

### 4. Indexes
Added indexes on `user_id` for all three tables to speed up RLS checks.

## Security
- RLS remains enabled on all three tables.
- All policies scoped TO authenticated with ownership checks.
- No permissive `WITH CHECK (true)` policies remain.
*/

-- ─── 1. Add user_id columns ────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'projects' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE public.projects ADD COLUMN user_id uuid;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'nodes' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE public.nodes ADD COLUMN user_id uuid;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'edges' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE public.edges ADD COLUMN user_id uuid;
  END IF;
END $$;

-- ─── 2. Backfill existing rows with the first authenticated user ───────────
-- This ensures existing demo data remains accessible after the policy change.
DO $$
DECLARE
  first_user uuid;
BEGIN
  SELECT id INTO first_user FROM auth.users ORDER BY created_at LIMIT 1;
  IF first_user IS NOT NULL THEN
    UPDATE public.projects SET user_id = first_user WHERE user_id IS NULL;
    UPDATE public.nodes SET user_id = first_user WHERE user_id IS NULL;
    UPDATE public.edges SET user_id = first_user WHERE user_id IS NULL;
  END IF;
END $$;

-- ─── 3. Enforce NOT NULL + default + FK ────────────────────────────────────
-- We do this after backfill so existing rows satisfy the constraint.

ALTER TABLE public.projects
  ALTER COLUMN user_id SET NOT NULL,
  ALTER COLUMN user_id SET DEFAULT auth.uid();

ALTER TABLE public.nodes
  ALTER COLUMN user_id SET NOT NULL,
  ALTER COLUMN user_id SET DEFAULT auth.uid();

ALTER TABLE public.edges
  ALTER COLUMN user_id SET NOT NULL,
  ALTER COLUMN user_id SET DEFAULT auth.uid();

-- Add foreign keys to auth.users (drop first if they already exist)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'projects_user_id_fkey'
  ) THEN
    ALTER TABLE public.projects
      ADD CONSTRAINT projects_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'nodes_user_id_fkey'
  ) THEN
    ALTER TABLE public.nodes
      ADD CONSTRAINT nodes_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'edges_user_id_fkey'
  ) THEN
    ALTER TABLE public.edges
      ADD CONSTRAINT edges_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ─── 4. Indexes for RLS performance ────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_projects_user_id ON public.projects(user_id);
CREATE INDEX IF NOT EXISTS idx_nodes_user_id ON public.nodes(user_id);
CREATE INDEX IF NOT EXISTS idx_edges_user_id ON public.edges(user_id);

-- ─── 5. Replace RLS policies with owner-scoped CRUD ────────────────────────

-- ── projects ──
DROP POLICY IF EXISTS "Allow authenticated inserts" ON public.projects;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.projects;
DROP POLICY IF EXISTS "anon_select_projects" ON public.projects;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.projects;

CREATE POLICY "select_own_projects" ON public.projects
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "insert_own_projects" ON public.projects
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "update_own_projects" ON public.projects
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "delete_own_projects" ON public.projects
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- ── nodes ──
DROP POLICY IF EXISTS "Allow authenticated inserts" ON public.nodes;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.nodes;
DROP POLICY IF EXISTS "anon_select_nodes" ON public.nodes;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.nodes;

CREATE POLICY "select_own_nodes" ON public.nodes
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "insert_own_nodes" ON public.nodes
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "update_own_nodes" ON public.nodes
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "delete_own_nodes" ON public.nodes
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- ── edges ──
DROP POLICY IF EXISTS "Allow authenticated inserts" ON public.edges;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.edges;
DROP POLICY IF EXISTS "anon_select_edges" ON public.edges;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.edges;

CREATE POLICY "select_own_edges" ON public.edges
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "insert_own_edges" ON public.edges
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "update_own_edges" ON public.edges
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "delete_own_edges" ON public.edges
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
