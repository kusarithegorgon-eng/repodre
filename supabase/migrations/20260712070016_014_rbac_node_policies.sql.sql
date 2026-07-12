/*
# RBAC: Role-based RLS policies for nodes and edges

## Purpose
Replace the current owner-based RLS on `nodes` and `edges` with role-based
policies that check `project_members.role`. This allows any EDITOR or ADMIN
on a project to modify any node/edge in that project, while VIEWERs get
read-only access. Anon users retain read access for public demo projects.

## Changes

### 1. Nodes table — RLS policy replacement
- Drops existing owner-based policies (select_own_nodes, insert_own_nodes,
  update_own_nodes, delete_own_nodes, users_*, anon_select_nodes)
- Creates new role-based policies:
  - SELECT: any project member OR anon (for public demos)
  - INSERT: EDITOR or ADMIN only (via EXISTS subquery on project_members)
  - UPDATE: EDITOR or ADMIN only
  - DELETE: ADMIN only (destructive action requires admin)

### 2. Edges table — RLS policy replacement
- Same role-based pattern as nodes

### Security model
- VIEWER: can read nodes/edges, cannot modify anything
- EDITOR: can create/update nodes/edges, cannot delete
- ADMIN: full CRUD on nodes/edges
- Anon: read-only (for public demo projects)

### Important notes
1. The EXISTS subquery joins project_members on project_id and checks
   that the authenticated user has the required role.
2. We use a helper function to avoid repeating the role check subquery.
3. The anon SELECT policy remains USING (true) for public demo access.
*/

-- Helper function: check if current user has a minimum role on a project
CREATE OR REPLACE FUNCTION public.can_edit_project(project_uuid uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_members pm
    WHERE pm.project_id = project_uuid
      AND pm.user_id = auth.uid()
      AND pm.role IN ('ADMIN', 'EDITOR')
  );
$$;

-- Helper function: check if current user is an admin on a project
CREATE OR REPLACE FUNCTION public.is_project_admin(project_uuid uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_members pm
    WHERE pm.project_id = project_uuid
      AND pm.user_id = auth.uid()
      AND pm.role = 'ADMIN'
  );
$$;

-- Grant execute on helper functions
GRANT EXECUTE ON FUNCTION public.can_edit_project(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_project_admin(uuid) TO authenticated;

-- =========================================================================
-- NODES: Drop old owner-based policies
-- =========================================================================
DROP POLICY IF EXISTS "select_own_nodes" ON public.nodes;
DROP POLICY IF EXISTS "insert_own_nodes" ON public.nodes;
DROP POLICY IF EXISTS "update_own_nodes" ON public.nodes;
DROP POLICY IF EXISTS "delete_own_nodes" ON public.nodes;
DROP POLICY IF EXISTS "users_select_own_nodes" ON public.nodes;
DROP POLICY IF EXISTS "users_insert_own_nodes" ON public.nodes;
DROP POLICY IF EXISTS "users_update_own_nodes" ON public.nodes;
DROP POLICY IF EXISTS "users_delete_own_nodes" ON public.nodes;
DROP POLICY IF EXISTS "anon_select_nodes" ON public.nodes;

-- NODES: New role-based policies
DROP POLICY IF EXISTS "rbac_select_nodes" ON public.nodes;
CREATE POLICY "rbac_select_nodes"
  ON public.nodes FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "rbac_insert_nodes" ON public.nodes;
CREATE POLICY "rbac_insert_nodes"
  ON public.nodes FOR INSERT
  TO authenticated
  WITH CHECK (public.can_edit_project(project_id));

DROP POLICY IF EXISTS "rbac_update_nodes" ON public.nodes;
CREATE POLICY "rbac_update_nodes"
  ON public.nodes FOR UPDATE
  TO authenticated
  USING (public.can_edit_project(project_id))
  WITH CHECK (public.can_edit_project(project_id));

DROP POLICY IF EXISTS "rbac_delete_nodes" ON public.nodes;
CREATE POLICY "rbac_delete_nodes"
  ON public.nodes FOR DELETE
  TO authenticated
  USING (public.is_project_admin(project_id));

-- =========================================================================
-- EDGES: Drop old policies and create role-based ones
-- =========================================================================
DROP POLICY IF EXISTS "select_own_edges" ON public.edges;
DROP POLICY IF EXISTS "insert_own_edges" ON public.edges;
DROP POLICY IF EXISTS "update_own_edges" ON public.edges;
DROP POLICY IF EXISTS "delete_own_edges" ON public.edges;
DROP POLICY IF EXISTS "users_select_own_edges" ON public.edges;
DROP POLICY IF EXISTS "users_insert_own_edges" ON public.edges;
DROP POLICY IF EXISTS "users_update_own_edges" ON public.edges;
DROP POLICY IF EXISTS "users_delete_own_edges" ON public.edges;
DROP POLICY IF EXISTS "anon_select_edges" ON public.edges;

-- EDGES: New role-based policies
DROP POLICY IF EXISTS "rbac_select_edges" ON public.edges;
CREATE POLICY "rbac_select_edges"
  ON public.edges FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "rbac_insert_edges" ON public.edges;
CREATE POLICY "rbac_insert_edges"
  ON public.edges FOR INSERT
  TO authenticated
  WITH CHECK (public.can_edit_project(project_id));

DROP POLICY IF EXISTS "rbac_update_edges" ON public.edges;
CREATE POLICY "rbac_update_edges"
  ON public.edges FOR UPDATE
  TO authenticated
  USING (public.can_edit_project(project_id))
  WITH CHECK (public.can_edit_project(project_id));

DROP POLICY IF EXISTS "rbac_delete_edges" ON public.edges;
CREATE POLICY "rbac_delete_edges"
  ON public.edges FOR DELETE
  TO authenticated
  USING (public.is_project_admin(project_id));
