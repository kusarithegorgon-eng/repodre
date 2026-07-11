/*
# Add anon RLS policies for Repodre app

## Summary
The Repodre app is a single-tenant application with NO sign-in screen. It uses the Supabase anon key
to read and write project data. The existing RLS policies on `projects`, `nodes`, and `edges` are
scoped to `authenticated` only, which means the anon-key frontend gets ZERO rows back — the tables
appear empty even though data exists.

This migration adds `anon`-accessible policies alongside the existing `authenticated` policies so
the Repodre app can:
- List recent projects (SELECT)
- Create new projects (INSERT)
- Update project metadata (UPDATE)
- Delete projects (DELETE)
- Read/write nodes and edges for the canvas

## Tables Modified
1. `projects` — add anon SELECT, INSERT, UPDATE, DELETE policies
2. `nodes` — add anon SELECT, INSERT, UPDATE, DELETE policies
3. `edges` — add anon SELECT, INSERT, UPDATE, DELETE policies

## Security
- All new policies use `TO anon, authenticated` so both roles can operate.
- `USING (true)` / `WITH CHECK (true)` is acceptable here because this is an intentionally
  shared single-tenant canvas application with no user isolation requirement.
- Existing authenticated-only policies are kept (they are redundant but harmless).

## Notes
1. Policies are dropped first (IF EXISTS) to ensure idempotency.
2. No data is modified — only policy definitions are added.
3. The `user_id` column on projects/nodes/edges defaults to `auth.uid()` which is NULL for anon,
   so inserts from the anon role will have `user_id = NULL`. The `WITH CHECK (true)` allows this.
*/

-- ===== PROJECTS =====
DROP POLICY IF EXISTS "anon_select_projects" ON projects;
CREATE POLICY "anon_select_projects" ON projects FOR SELECT
TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_projects" ON projects;
CREATE POLICY "anon_insert_projects" ON projects FOR INSERT
TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_projects" ON projects;
CREATE POLICY "anon_update_projects" ON projects FOR UPDATE
TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_projects" ON projects;
CREATE POLICY "anon_delete_projects" ON projects FOR DELETE
TO anon, authenticated USING (true);

-- ===== NODES =====
DROP POLICY IF EXISTS "anon_select_nodes" ON nodes;
CREATE POLICY "anon_select_nodes" ON nodes FOR SELECT
TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_nodes" ON nodes;
CREATE POLICY "anon_insert_nodes" ON nodes FOR INSERT
TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_nodes" ON nodes;
CREATE POLICY "anon_update_nodes" ON nodes FOR UPDATE
TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_nodes" ON nodes;
CREATE POLICY "anon_delete_nodes" ON nodes FOR DELETE
TO anon, authenticated USING (true);

-- ===== EDGES =====
DROP POLICY IF EXISTS "anon_select_edges" ON edges;
CREATE POLICY "anon_select_edges" ON edges FOR SELECT
TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_edges" ON edges;
CREATE POLICY "anon_insert_edges" ON edges FOR INSERT
TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_edges" ON edges;
CREATE POLICY "anon_update_edges" ON edges FOR UPDATE
TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_edges" ON edges;
CREATE POLICY "anon_delete_edges" ON edges FOR DELETE
TO anon, authenticated USING (true);
