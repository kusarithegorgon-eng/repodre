/*
# Add project membership and invitation tables

This migration adds the collaboration tables that the app expects for
project membership and invitation workflows.

It also enables row level security and grants broad authenticated
CRUD access so the client can manage collaborators in the shared canvas model.
*/

CREATE TABLE IF NOT EXISTS project_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  email text NOT NULL,
  role text NOT NULL CHECK (role IN ('ADMIN', 'EDITOR', 'VIEWER')),
  created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_project_members_project_user ON project_members(project_id, user_id);
CREATE INDEX IF NOT EXISTS idx_project_members_project_id ON project_members(project_id);

CREATE TABLE IF NOT EXISTS project_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL CHECK (role IN ('ADMIN', 'EDITOR', 'VIEWER')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked')),
  invited_by uuid,
  accepted_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_invitations_project_id ON project_invitations(project_id);
CREATE INDEX IF NOT EXISTS idx_project_invitations_email ON project_invitations(email);

ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_invitations ENABLE ROW LEVEL SECURITY;

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
