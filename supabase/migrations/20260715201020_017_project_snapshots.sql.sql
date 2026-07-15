/*
# Create project_snapshots table for versioning / time travel

## Purpose
Allows users to save named versions of their architecture (nodes + edges)
and restore them later. This provides a "time travel" safety net for teams
that need to audit or roll back architecture changes.

## New Table: project_snapshots
- id (uuid, primary key)
- project_id (uuid, FK to projects.id, ON DELETE CASCADE)
- name (text, NOT NULL) — user-given label e.g. "v1.0 - Pre-Refactor"
- description (text, nullable)
- nodes (jsonb, NOT NULL) — serialized array of node objects
- edges (jsonb, NOT NULL) — serialized array of edge objects
- created_by (uuid, FK to auth.users.id, nullable)
- created_at (timestamptz, default now())

## Security (RLS)
- SELECT: project members and owners can view snapshots
- INSERT: authenticated users who are project members (EDITOR/ADMIN) or owners
- DELETE: project admins/owners only
*/

CREATE TABLE IF NOT EXISTS project_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  nodes jsonb NOT NULL DEFAULT '[]',
  edges jsonb NOT NULL DEFAULT '[]',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_snapshots_project_id
  ON project_snapshots (project_id);

CREATE INDEX IF NOT EXISTS idx_project_snapshots_created_at
  ON project_snapshots (created_at DESC);

ALTER TABLE project_snapshots ENABLE ROW LEVEL SECURITY;

-- SELECT: project members and owners
DROP POLICY IF EXISTS "select_snapshots" ON project_snapshots;
CREATE POLICY "select_snapshots"
  ON project_snapshots FOR SELECT
  TO authenticated
  USING (
    project_id IN (SELECT p.id FROM public.projects p WHERE p.user_id = auth.uid())
    OR project_id IN (
      SELECT pm.project_id FROM public.project_members pm
      WHERE pm.user_id = auth.uid()
    )
  );

-- INSERT: project editors/admins and owners
DROP POLICY IF EXISTS "insert_snapshots" ON project_snapshots;
CREATE POLICY "insert_snapshots"
  ON project_snapshots FOR INSERT
  TO authenticated
  WITH CHECK (
    project_id IN (SELECT p.id FROM public.projects p WHERE p.user_id = auth.uid())
    OR project_id IN (
      SELECT pm.project_id FROM public.project_members pm
      WHERE pm.user_id = auth.uid() AND pm.role IN ('ADMIN', 'EDITOR')
    )
  );

-- DELETE: project admins/owners only
DROP POLICY IF EXISTS "delete_snapshots" ON project_snapshots;
CREATE POLICY "delete_snapshots"
  ON project_snapshots FOR DELETE
  TO authenticated
  USING (
    project_id IN (SELECT p.id FROM public.projects p WHERE p.user_id = auth.uid())
    OR project_id IN (
      SELECT pm.project_id FROM public.project_members pm
      WHERE pm.user_id = auth.uid() AND pm.role = 'ADMIN'
    )
  );
