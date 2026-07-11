/*
# Create project_members table for RBAC

## Purpose
Establishes a normalized many-to-many relationship between users and projects
with role-based access control. Each member row stores a userId, email, and role
(ADMIN, EDITOR, or VIEWER). This avoids the race-condition risk of storing
members as a JSON array on the projects table, where concurrent invites would
overwrite each other.

## New Tables
- `project_members`
  - `id` (uuid, primary key)
  - `project_id` (uuid, FK to projects.id, ON DELETE CASCADE)
  - `user_id` (uuid, FK to auth.users.id, ON DELETE CASCADE)
  - `email` (text, not null — the invitee's email at time of invite)
  - `role` (text, not null, CHECK constraint enforces ADMIN/EDITOR/VIEWER)
  - `invited_by` (uuid, FK to auth.users.id, nullable)
  - `created_at` (timestamptz, default now())
  - Unique constraint on (project_id, user_id) — prevents duplicate memberships

## Security (RLS)
- RLS enabled on project_members.
- SELECT: authenticated users can see members of projects they belong to.
- INSERT: authenticated users can add members only to projects where they are ADMIN.
- UPDATE: authenticated users can change roles only if they are ADMIN of the project.
- DELETE: authenticated users can remove members only if they are ADMIN of the project.

## Important Notes
1. The unique constraint on (project_id, user_id) makes concurrent invites
   atomic — two admins inviting the same user simultaneously will result in
   one success and one constraint violation, not a lost write.
2. Role values are uppercase in the database (ADMIN, EDITOR, VIEWER) to
   distinguish from the lowercase app-level Role type in rbac.ts.
3. The project owner (projects.user_id) is automatically an ADMIN by
   convention; a trigger could enforce this but is not required for the
   current single-owner model.
*/

CREATE TABLE IF NOT EXISTS project_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL CHECK (role IN ('ADMIN', 'EDITOR', 'VIEWER')),
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Unique constraint: one membership per user per project
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'project_members_project_user_unique'
  ) THEN
    CREATE UNIQUE INDEX project_members_project_user_unique
      ON project_members (project_id, user_id);
  END IF;
END $$;

-- Index for querying all members of a project
CREATE INDEX IF NOT EXISTS idx_project_members_project_id
  ON project_members (project_id);

-- Index for querying all projects a user belongs to
CREATE INDEX IF NOT EXISTS idx_project_members_user_id
  ON project_members (user_id);

ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;

-- SELECT: users can see members of projects they belong to
DROP POLICY IF EXISTS "select_project_members" ON project_members;
CREATE POLICY "select_project_members"
  ON project_members FOR SELECT
  TO authenticated
  USING (
    project_id IN (
      SELECT pm.project_id FROM project_members pm
      WHERE pm.user_id = auth.uid()
    )
    OR project_id IN (
      SELECT p.id FROM projects p WHERE p.user_id = auth.uid()
    )
  );

-- INSERT: only project admins (or the project owner) can invite members
DROP POLICY IF EXISTS "insert_project_members" ON project_members;
CREATE POLICY "insert_project_members"
  ON project_members FOR INSERT
  TO authenticated
  WITH CHECK (
    project_id IN (
      SELECT pm.project_id FROM project_members pm
      WHERE pm.user_id = auth.uid() AND pm.role = 'ADMIN'
    )
    OR project_id IN (
      SELECT p.id FROM projects p WHERE p.user_id = auth.uid()
    )
  );

-- UPDATE: only project admins can change member roles
DROP POLICY IF EXISTS "update_project_members" ON project_members;
CREATE POLICY "update_project_members"
  ON project_members FOR UPDATE
  TO authenticated
  USING (
    project_id IN (
      SELECT pm.project_id FROM project_members pm
      WHERE pm.user_id = auth.uid() AND pm.role = 'ADMIN'
    )
    OR project_id IN (
      SELECT p.id FROM projects p WHERE p.user_id = auth.uid()
    )
  )
  WITH CHECK (
    project_id IN (
      SELECT pm.project_id FROM project_members pm
      WHERE pm.user_id = auth.uid() AND pm.role = 'ADMIN'
    )
    OR project_id IN (
      SELECT p.id FROM projects p WHERE p.user_id = auth.uid()
    )
  );

-- DELETE: only project admins can remove members
DROP POLICY IF EXISTS "delete_project_members" ON project_members;
CREATE POLICY "delete_project_members"
  ON project_members FOR DELETE
  TO authenticated
  USING (
    project_id IN (
      SELECT pm.project_id FROM project_members pm
      WHERE pm.user_id = auth.uid() AND pm.role = 'ADMIN'
    )
    OR project_id IN (
      SELECT p.id FROM projects p WHERE p.user_id = auth.uid()
    )
  );
