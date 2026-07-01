/*
# Create canvas schema for Repodre

1. New Tables
- `projects` - stores project/canvas metadata (name, description, zoom level, auto-layout settings)
- `nodes` - stores canvas nodes with shape, position, label, accent color, and optional dimensions
- `edges` - stores connections between nodes with optional handle segments for anchor points

2. Security
- Enable RLS on all tables.
- Allow anon + authenticated full CRUD because this is a single-tenant shared canvas application.
- All data is intentionally public/shared within the project context.

3. Relationships
- `nodes.project_id` references `projects.id` (cascade delete)
- `edges.project_id` references `projects.id` (cascade delete)
- `edges.from_node` and `edges.to_node` reference `nodes.id` (cascade delete)
- Unique constraint on edge pairs to prevent duplicate connections

4. Indexes
- Index on `nodes.project_id` for efficient node lookups per project
- Index on `edges.project_id` for efficient edge lookups per project
- Composite index on `edges.from_node, edges.to_node` for duplicate detection
*/

CREATE TABLE IF NOT EXISTS projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  zoom integer NOT NULL DEFAULT 100,
  auto_layout boolean NOT NULL DEFAULT true,
  smart_route boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  label text NOT NULL,
  sub text NOT NULL DEFAULT '',
  shape text NOT NULL DEFAULT 'rectangle',
  accent text NOT NULL DEFAULT 'teal',
  x double precision NOT NULL DEFAULT 0,
  y double precision NOT NULL DEFAULT 0,
  w double precision,
  h double precision,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT valid_shape CHECK (shape IN ('rectangle', 'diamond', 'cylinder', 'pill')),
  CONSTRAINT valid_accent CHECK (accent IN ('green', 'purple', 'teal', 'blue'))
);

CREATE TABLE IF NOT EXISTS edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  from_node uuid NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  to_node uuid NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  from_handle text,
  to_handle text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT valid_from_handle CHECK (from_handle IS NULL OR from_handle IN ('n', 'e', 's', 'w', 'ne', 'se', 'sw', 'nw')),
  CONSTRAINT valid_to_handle CHECK (to_handle IS NULL OR to_handle IN ('n', 'e', 's', 'w', 'ne', 'se', 'sw', 'nw')),
  CONSTRAINT no_self_reference CHECK (from_node != to_node),
  UNIQUE (project_id, from_node, to_node)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_nodes_project_id ON nodes(project_id);
CREATE INDEX IF NOT EXISTS idx_edges_project_id ON edges(project_id);
CREATE INDEX IF NOT EXISTS idx_edges_nodes ON edges(from_node, to_node);

-- Enable RLS on all tables
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE edges ENABLE ROW LEVEL SECURITY;

-- Projects: full CRUD for anon + authenticated (single-tenant shared data)
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

-- Nodes: full CRUD for anon + authenticated (single-tenant shared data)
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

-- Edges: full CRUD for anon + authenticated (single-tenant shared data)
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

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers to auto-update updated_at on each table
DROP TRIGGER IF EXISTS update_projects_updated_at ON projects;
CREATE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_nodes_updated_at ON nodes;
CREATE TRIGGER update_nodes_updated_at
  BEFORE UPDATE ON nodes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_edges_updated_at ON edges;
CREATE TRIGGER update_edges_updated_at
  BEFORE UPDATE ON edges
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();