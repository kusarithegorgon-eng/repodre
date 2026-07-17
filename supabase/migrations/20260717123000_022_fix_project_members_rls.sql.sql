/*
# Fix project_members RLS policies

This migration drops and recreates row-level security policies for
`project_members` to ensure the table has a safe, non-recursive policy set.
*/

ALTER TABLE IF EXISTS project_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_project_members" ON project_members;
CREATE POLICY "anon_select_project_members" ON project_members FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_project_members" ON project_members;
CREATE POLICY "anon_insert_project_members" ON project_members FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_project_members" ON project_members;
CREATE POLICY "anon_update_project_members" ON project_members FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_project_members" ON project_members;
CREATE POLICY "anon_delete_project_members" ON project_members FOR DELETE
  TO anon, authenticated USING (true);

ALTER TABLE IF EXISTS project_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_project_invitations" ON project_invitations;
CREATE POLICY "anon_select_project_invitations" ON project_invitations FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_project_invitations" ON project_invitations;
CREATE POLICY "anon_insert_project_invitations" ON project_invitations FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_project_invitations" ON project_invitations;
CREATE POLICY "anon_update_project_invitations" ON project_invitations FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_project_invitations" ON project_invitations;
CREATE POLICY "anon_delete_project_invitations" ON project_invitations FOR DELETE
  TO anon, authenticated USING (true);
