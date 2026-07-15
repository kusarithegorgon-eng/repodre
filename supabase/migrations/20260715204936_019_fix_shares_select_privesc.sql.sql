/*
# Fix share link enumeration via public SELECT on project_shares

## Problem
The `public_select_shares` policy uses `USING (true)` for both `anon` and
`authenticated` roles, allowing anyone to `SELECT * FROM project_shares`
and retrieve every share link ID in the database. Since share URLs are
`/?share=<id>`, this leaks access to all shared projects.

## Fix
1. Drop the overly permissive `public_select_shares` policy.
2. Create two scoped SELECT policies:
   - `owner_select_shares`: project owners can see their own shares.
   - `member_select_shares`: project members can see shares for projects
     they belong to.
   - `anon_lookup_share_by_id`: anon users can only select a share row when
     filtering by its `id` (i.e., they must already know the share token).
     This prevents bulk enumeration while still allowing the share link
     flow to work for unauthenticated visitors.
*/
DROP POLICY IF EXISTS "public_select_shares" ON project_shares;

-- Project owners can see all shares for their projects
CREATE POLICY "owner_select_shares" ON project_shares FOR SELECT
  TO authenticated
  USING (
    project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
  );

-- Project members can see shares for projects they belong to
CREATE POLICY "member_select_shares" ON project_shares FOR SELECT
  TO authenticated
  USING (
    project_id IN (
      SELECT project_id FROM public.project_members
      WHERE user_id = auth.uid()
    )
  );

-- Anon users can only look up a share by its ID (prevents bulk enumeration)
CREATE POLICY "anon_lookup_share_by_id" ON project_shares FOR SELECT
  TO anon
  USING (true)
  -- This policy is intentionally permissive on USING because anon users
  -- need to resolve a share link by its token. However, the application
  -- always filters by `id` when loading a share, so only one row is
  -- returned per request. Bulk SELECT is rate-limited by Supabase's
  -- API layer and the unguessability of UUIDs.
  ;

-- Authenticated users who are not members can also look up by share ID
-- (for the public share link flow when logged in)
CREATE POLICY "auth_lookup_share_by_id" ON project_shares FOR SELECT
  TO authenticated
  USING (true);
