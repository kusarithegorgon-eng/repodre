/*
# Reset collaboration table policies

This migration removes any existing row-level security policies on
`project_members` and `project_invitations`, then recreates a clean set of
explicit, permissive policies for both anon and authenticated roles.
*/

DO $$
DECLARE
  policy_record record;
BEGIN
  FOR policy_record IN
    SELECT polname, polrelid
    FROM pg_policy
    WHERE polrelid IN (
      'project_members'::regclass,
      'project_invitations'::regclass
    )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %s', policy_record.polname, quote_ident(policy_record.polrelid::regclass::text));
  END LOOP;
END
$$;

ALTER TABLE IF EXISTS project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS project_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_select_project_members" ON project_members FOR SELECT
  TO anon, authenticated USING (true);

CREATE POLICY "anon_insert_project_members" ON project_members FOR INSERT
  TO anon, authenticated WITH CHECK (true);

CREATE POLICY "anon_update_project_members" ON project_members FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY "anon_delete_project_members" ON project_members FOR DELETE
  TO anon, authenticated USING (true);

CREATE POLICY "anon_select_project_invitations" ON project_invitations FOR SELECT
  TO anon, authenticated USING (true);

CREATE POLICY "anon_insert_project_invitations" ON project_invitations FOR INSERT
  TO anon, authenticated WITH CHECK (true);

CREATE POLICY "anon_update_project_invitations" ON project_invitations FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY "anon_delete_project_invitations" ON project_invitations FOR DELETE
  TO anon, authenticated USING (true);
