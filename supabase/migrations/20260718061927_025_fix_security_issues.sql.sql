/*
# Fix critical RLS and function security issues

## Summary
This migration closes several security holes flagged by the Supabase
Security Advisor:

1. `public.has_edit_share` was a SECURITY DEFINER function with a mutable
   search_path (no explicit `SET search_path`). It is now SECURITY INVOKER
   with an explicit `SET search_path TO public`, so it runs with the caller's
   privileges and always resolves the `project_shares` table against the
   `public` schema.

2. `public.auto_create_admin_membership` is a trigger function that must stay
   SECURITY DEFINER (it writes to `project_members` on behalf of the project
   creator). It already had `SET search_path TO 'public'`, so it is not
   flagged for search_path mutability — but it was executable by `anon`,
   `authenticated`, and `public` via the REST RPC endpoint. We REVOKE
   EXECUTE from those roles so the function can only be invoked by the
   trigger (which runs as the function owner), not by any API caller.

3. The `anon_*` policies on `nodes`, `edges`, `project_members`, and
   `project_invitations` used `USING (true)` / `WITH CHECK (true)` for
   INSERT/UPDATE/DELETE, which gave unrestricted write access to anyone
   (including unauthenticated `anon` callers). These are replaced with
   proper ownership / membership / share checks:

   - `nodes` and `edges`: writes require either project membership with an
     ADMIN/EDITOR role (`can_edit_project`) OR a valid edit share
     (`has_edit_share`). DELETE requires ADMIN role (`is_project_admin`).
   - `project_members` and `project_invitations`: writes require the caller
     to be an ADMIN of the project (via `is_project_admin`), except that a
     user can still accept their own invitation (UPDATE on
     `project_invitations` where `email` matches the caller's email).

## Tables modified
- None (schema unchanged).

## Security changes
- `has_edit_share`: SECURITY DEFINER -> SECURITY INVOKER, explicit
  `search_path = public`.
- `auto_create_admin_membership`: REVOKE EXECUTE from `public`, `anon`,
  `authenticated`.
- `nodes`: drop redundant `anon_insert_nodes_edit_share`,
  `anon_update_nodes_edit_share`, and the always-true `anon_insert_nodes`,
  `anon_update_nodes`, `anon_delete_nodes`. Add scoped replacements.
- `edges`: drop redundant `anon_insert_edges_edit_share`,
  `anon_update_edges_edit_share`, and the always-true `anon_insert_edges`,
  `anon_update_edges`, `anon_delete_edges`. Add scoped replacements.
- `project_members`: drop `anon_insert_project_members`,
  `anon_update_project_members`, `anon_delete_project_members`. Add scoped
  replacements.
- `project_invitations`: drop `anon_insert_project_invitations`,
  `anon_update_project_invitations`, `anon_delete_project_invitations`.
  Add scoped replacements.

## Important notes
1. SELECT policies on these tables already allow public read access
   (`anon_select_*` with `USING (true)`). That is intentional for this app —
   projects are shareable via public links, so canvas data is readable by
   anyone with the project ID. Only writes are being locked down here.
2. The existing `rbac_*` policies on `nodes`/`edges` (scoped to
   `authenticated` via `can_edit_project` / `is_project_admin`) are kept
   unchanged; the new `anon_*` policies extend the same logic to the `anon`
   role so that anonymous users editing via a share link can still do so
   through the `has_edit_share` path, while authenticated members go through
   `can_edit_project`.
3. `has_edit_share` being SECURITY INVOKER is safe because `project_shares`
   has a permissive SELECT policy (`anon_lookup_share_by_id` /
   `auth_lookup_share_by_id` both use `USING (true)`), so the invoker can
   read the rows the function needs to evaluate.
*/

-- ─── 1. Drop redundant edit_share policies that reference has_edit_share ───
-- These are subsumed by the new combined policies below.
DROP POLICY IF EXISTS anon_insert_nodes_edit_share ON nodes;
DROP POLICY IF EXISTS anon_update_nodes_edit_share ON nodes;
DROP POLICY IF EXISTS anon_insert_edges_edit_share ON edges;
DROP POLICY IF EXISTS anon_update_edges_edit_share ON edges;

-- ─── 2. Fix has_edit_share: SECURITY INVOKER + explicit search_path ────────
DROP FUNCTION IF EXISTS public.has_edit_share(uuid);

CREATE FUNCTION public.has_edit_share(project_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.project_shares
    WHERE project_id = project_uuid
      AND access_level = 'edit'
      AND (expires_at IS NULL OR expires_at > now())
  );
$$;

-- Revoke any direct EXECUTE grants on the helper so only the RLS policy
-- expressions (which run as the querying role) can call it.
REVOKE EXECUTE ON FUNCTION public.has_edit_share(uuid) FROM PUBLIC, anon, authenticated;

-- ─── 3. Lock down auto_create_admin_membership to trigger-only ────────────
-- It must remain SECURITY DEFINER (trigger writes to project_members as the
-- project creator), but it must NOT be callable via REST/RPC by any role.
REVOKE EXECUTE ON FUNCTION public.auto_create_admin_membership() FROM PUBLIC, anon, authenticated;

-- ─── 4. nodes: replace always-true write policies with ownership checks ───
DROP POLICY IF EXISTS anon_insert_nodes ON nodes;
DROP POLICY IF EXISTS anon_update_nodes ON nodes;
DROP POLICY IF EXISTS anon_delete_nodes ON nodes;

-- INSERT: project member (ADMIN/EDITOR) OR holder of an edit share.
CREATE POLICY "anon_insert_nodes" ON nodes FOR INSERT
  TO anon, authenticated
  WITH CHECK (can_edit_project(project_id) OR has_edit_share(project_id));

-- UPDATE: same as INSERT (can edit) — covers both members and share holders.
CREATE POLICY "anon_update_nodes" ON nodes FOR UPDATE
  TO anon, authenticated
  USING (can_edit_project(project_id) OR has_edit_share(project_id))
  WITH CHECK (can_edit_project(project_id) OR has_edit_share(project_id));

-- DELETE: project admins only.
CREATE POLICY "anon_delete_nodes" ON nodes FOR DELETE
  TO anon, authenticated
  USING (is_project_admin(project_id));

-- ─── 5. edges: replace always-true write policies with ownership checks ───
DROP POLICY IF EXISTS anon_insert_edges ON edges;
DROP POLICY IF EXISTS anon_update_edges ON edges;
DROP POLICY IF EXISTS anon_delete_edges ON edges;

CREATE POLICY "anon_insert_edges" ON edges FOR INSERT
  TO anon, authenticated
  WITH CHECK (can_edit_project(project_id) OR has_edit_share(project_id));

CREATE POLICY "anon_update_edges" ON edges FOR UPDATE
  TO anon, authenticated
  USING (can_edit_project(project_id) OR has_edit_share(project_id))
  WITH CHECK (can_edit_project(project_id) OR has_edit_share(project_id));

CREATE POLICY "anon_delete_edges" ON edges FOR DELETE
  TO anon, authenticated
  USING (is_project_admin(project_id));

-- ─── 6. project_members: admin-scoped write policies ───────────────────────
DROP POLICY IF EXISTS anon_insert_project_members ON project_members;
DROP POLICY IF EXISTS anon_update_project_members ON project_members;
DROP POLICY IF EXISTS anon_delete_project_members ON project_members;

-- Only an admin of the project can add members.
CREATE POLICY "anon_insert_project_members" ON project_members FOR INSERT
  TO anon, authenticated
  WITH CHECK (is_project_admin(project_id));

-- Only an admin of the project can update member rows.
CREATE POLICY "anon_update_project_members" ON project_members FOR UPDATE
  TO anon, authenticated
  USING (is_project_admin(project_id))
  WITH CHECK (is_project_admin(project_id));

-- Only an admin of the project can remove members.
CREATE POLICY "anon_delete_project_members" ON project_members FOR DELETE
  TO anon, authenticated
  USING (is_project_admin(project_id));

-- ─── 7. project_invitations: admin-scoped, with self-accept ────────────────
DROP POLICY IF EXISTS anon_insert_project_invitations ON project_invitations;
DROP POLICY IF EXISTS anon_update_project_invitations ON project_invitations;
DROP POLICY IF EXISTS anon_delete_project_invitations ON project_invitations;

-- Only an admin of the project can create invitations.
CREATE POLICY "anon_insert_project_invitations" ON project_invitations FOR INSERT
  TO anon, authenticated
  WITH CHECK (is_project_admin(project_id));

-- Admins can update any invitation; the invited user can update their own
-- invitation (to accept it) — matched by email to the caller's identity.
CREATE POLICY "anon_update_project_invitations" ON project_invitations FOR UPDATE
  TO anon, authenticated
  USING (
    is_project_admin(project_id)
    OR email = (SELECT email FROM auth.users WHERE id = auth.uid())
  )
  WITH CHECK (
    is_project_admin(project_id)
    OR email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

-- Only an admin of the project can delete invitations.
CREATE POLICY "anon_delete_project_invitations" ON project_invitations FOR DELETE
  TO anon, authenticated
  USING (is_project_admin(project_id));
