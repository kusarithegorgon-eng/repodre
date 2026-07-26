/*
# Canvas Sections — Figma-style grouping containers

## Purpose
Adds first-class "Section" containers to the canvas, letting users group related
architecture nodes into clean visual rectangles (like Figma's Section tool).
Sections support custom titles, color tags, a "Ready for Dev" status flag, and
automatic nesting of child nodes based on collision detection.

## New Tables
- `sections`
  - `id` (uuid, PK) — unique section identifier
  - `project_id` (uuid, FK → projects) — owning project
  - `label` (text, not null) — section title shown in header (e.g. "Auth Module")
  - `color` (text, not null, default 'blue') — accent color tag
  - `x` (double precision, not null, default 0) — canvas X (top-left)
  - `y` (double precision, not null, default 0) — canvas Y (top-left)
  - `w` (double precision, not null, default 600) — width
  - `h` (double precision, not null, default 400) — height
  - `dev_status` (text, not null, default 'draft') — 'draft' | 'ready' | 'in_progress' | 'done'
  - `workspace` (text, not null, default 'app') — 'app' | 'erd' (matches nodes.workspace)
  - `created_at` (timestamptz, default now())
  - `updated_at` (timestamptz, default now())

## Modified Tables
- `nodes`
  - Adds `section_id` (uuid, nullable, FK → sections ON DELETE SET NULL) — optional
    grouping reference. Nullable because nodes can exist outside any section.
    ON DELETE SET NULL so deleting a section doesn't delete the nodes inside it.

## Security
- RLS enabled on `sections`.
- 4 CRUD policies (select/insert/update/delete), scoped to `anon, authenticated`,
  matching the existing `nodes` table pattern:
  - SELECT: public read (USING true) — same as nodes
  - INSERT: can_edit_project OR has_edit_share
  - UPDATE: can_edit_project OR has_edit_share
  - DELETE: is_project_admin

## Important Notes
1. The `sections` table reuses the same RBAC helper functions (`can_edit_project`,
   `has_edit_share`, `is_project_admin`) already used by `nodes`.
2. `section_id` on `nodes` is nullable with ON DELETE SET NULL, so removing a
   section leaves its former children orphaned but intact — no data loss.
3. `dev_status` supports a 'ready' value that the frontend uses to visually flag
   "Ready for Dev" sections.
*/

CREATE TABLE IF NOT EXISTS sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT 'New Section',
  color text NOT NULL DEFAULT 'blue',
  x double precision NOT NULL DEFAULT 0,
  y double precision NOT NULL DEFAULT 0,
  w double precision NOT NULL DEFAULT 600,
  h double precision NOT NULL DEFAULT 400,
  dev_status text NOT NULL DEFAULT 'draft',
  workspace text NOT NULL DEFAULT 'app',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE sections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_sections" ON sections;
CREATE POLICY "anon_select_sections" ON sections FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_sections" ON sections;
CREATE POLICY "anon_insert_sections" ON sections FOR INSERT
  TO anon, authenticated WITH CHECK (can_edit_project(project_id) OR has_edit_share(project_id));

DROP POLICY IF EXISTS "anon_update_sections" ON sections;
CREATE POLICY "anon_update_sections" ON sections FOR UPDATE
  TO anon, authenticated
  USING (can_edit_project(project_id) OR has_edit_share(project_id))
  WITH CHECK (can_edit_project(project_id) OR has_edit_share(project_id));

DROP POLICY IF EXISTS "anon_delete_sections" ON sections;
CREATE POLICY "anon_delete_sections" ON sections FOR DELETE
  TO anon, authenticated USING (is_project_admin(project_id));

-- Add section_id to nodes (nullable, ON DELETE SET NULL)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'nodes' AND column_name = 'section_id'
  ) THEN
    ALTER TABLE nodes ADD COLUMN section_id uuid REFERENCES sections(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Index for quick lookup of nodes by section
CREATE INDEX IF NOT EXISTS idx_nodes_section_id ON nodes(section_id) WHERE section_id IS NOT NULL;
