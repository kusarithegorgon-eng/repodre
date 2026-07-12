/*
# Fix security issues

## Changes

1. **Function search_path hardened**
   - `public.update_updated_at_column` recreated with `SET search_path = ''` and
     fully-qualified `pg_catalog.now()` to prevent search_path injection attacks.

2. **annotations RLS policies tightened**
   - Replaced always-true INSERT / UPDATE / DELETE policies with owner-scoped
     predicates using `auth.uid() = author_id`.
   - SELECT policy (`anon_select_annotations`) left as-is — annotations are
     intentionally readable by all (collaborative canvas comments).

3. **Always-true anon policies removed from nodes / edges / projects**
   - `anon_insert_nodes`, `anon_update_nodes`, `anon_delete_nodes`
   - `anon_insert_edges`, `anon_update_edges`, `anon_delete_edges`
   - `anon_insert_projects`, `anon_update_projects`, `anon_delete_projects`
   - The proper `authenticated`-scoped ownership policies already exist and remain.
     Unauthenticated users can still SELECT (existing anon_select_* policies) but
     can no longer mutate any row they do not own.

4. **user_roles RLS policies added**
   - Table had RLS enabled but zero policies (locked to everyone).
   - Added four owner-scoped policies: authenticated users may read, insert,
     update, and delete only their own role row.

## Security notes
- All ownership checks use `auth.uid()` — never `current_user`.
- No data is dropped or altered, only policies are changed.
*/

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Fix update_updated_at_column search_path
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = pg_catalog.now();
  RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. annotations — replace always-true mutation policies with owner-scoped ones
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "authenticated_insert_annotations" ON public.annotations;
CREATE POLICY "authenticated_insert_annotations"
  ON public.annotations FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = author_id);

DROP POLICY IF EXISTS "authenticated_update_annotations" ON public.annotations;
CREATE POLICY "authenticated_update_annotations"
  ON public.annotations FOR UPDATE
  TO authenticated
  USING  (auth.uid() = author_id)
  WITH CHECK (auth.uid() = author_id);

DROP POLICY IF EXISTS "authenticated_delete_annotations" ON public.annotations;
CREATE POLICY "authenticated_delete_annotations"
  ON public.annotations FOR DELETE
  TO authenticated
  USING (auth.uid() = author_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Remove always-true anon mutation policies from nodes / edges / projects
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "anon_insert_nodes"    ON public.nodes;
DROP POLICY IF EXISTS "anon_update_nodes"    ON public.nodes;
DROP POLICY IF EXISTS "anon_delete_nodes"    ON public.nodes;

DROP POLICY IF EXISTS "anon_insert_edges"    ON public.edges;
DROP POLICY IF EXISTS "anon_update_edges"    ON public.edges;
DROP POLICY IF EXISTS "anon_delete_edges"    ON public.edges;

DROP POLICY IF EXISTS "anon_insert_projects" ON public.projects;
DROP POLICY IF EXISTS "anon_update_projects" ON public.projects;
DROP POLICY IF EXISTS "anon_delete_projects" ON public.projects;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. user_roles — add policies (table had RLS enabled with zero policies)
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "select_own_user_role" ON public.user_roles;
CREATE POLICY "select_own_user_role"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_user_role" ON public.user_roles;
CREATE POLICY "insert_own_user_role"
  ON public.user_roles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_user_role" ON public.user_roles;
CREATE POLICY "update_own_user_role"
  ON public.user_roles FOR UPDATE
  TO authenticated
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_user_role" ON public.user_roles;
CREATE POLICY "delete_own_user_role"
  ON public.user_roles FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
