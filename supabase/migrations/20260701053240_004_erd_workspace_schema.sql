/*
# Expand schema for Database ERD workspace

This migration upgrades the canvas schema to support a second workspace
viewport (the Database ERD view) alongside the existing App Journey view.

1. Constraint expansions (idempotent)
   - `nodes.shape` now accepts all 7 shapes:
     rectangle, diamond, cylinder, pill, triangle, parallelogram, document.
   - `nodes.accent` now accepts all 6 accents:
     green, purple, teal, blue, orange, red.
   (The live DB was created with only 4 of each; this brings it in line with
   the StudioPage palette and the on-disk 003 migration that was never
   applied to the live instance.)

2. New columns on `projects`
   - `workspace` text, default 'app' — which viewport the project is showing.
     Valid values: 'app' (App Journey timeline) or 'erd' (Database ERD grid).
   - `schema_source` text — the raw DDL the user pasted into the schema input
     (PostgreSQL, MySQL/MariaDB, or SQLite). Null for projects generated
     from GitHub analysis.

3. New columns on `nodes`
   - `workspace` text, default 'app' — which viewport this node belongs to.
   - `columns` jsonb — for ERD table nodes, the array of column definitions
     {name, type, pk, fk, unique, nullable} parsed from the DDL. Null for
     non-table nodes.
   - `table_name` text — the original SQL table name (used for FK resolution
     and export). Null for non-table nodes.

4. New columns on `edges`
   - `cardinality` text — 'one-to-one' or 'one-to-many'. Null for non-ERD
     edges (App Journey edges have no cardinality).
   - `from_column` text — the FK column name on the source table (ERD only).
   - `to_column` text — the referenced column name on the target table
     (ERD only, usually the PK).

5. Seed demo data (idempotent)
   - One demo project (App Journey viewport) with 6 nodes + 6 edges matching
     the StudioPage INITIAL_NODES/INITIAL_EDGES demo, so the studio canvas
     is populated on first load.
   - One demo ERD project with 3 table nodes (users, profiles, posts) and
     2 FK edges with cardinality, so the ERD viewport has content.

6. Security
   - No RLS policy changes. Existing anon+authenticated CRUD policies on
     projects/nodes/edges already cover the new columns (policies are
     column-agnostic in this single-tenant shared-canvas app).

7. Notes
   - All statements are idempotent (IF NOT EXISTS / DROP CONSTRAINT IF EXISTS).
   - No data is lost: we only ADD columns and relax constraints.
*/

-- ── 1. Expand shape + accent constraints ───────────────────────────────────
ALTER TABLE nodes DROP CONSTRAINT IF EXISTS valid_shape;
ALTER TABLE nodes ADD CONSTRAINT valid_shape CHECK (
  shape IN ('rectangle', 'diamond', 'cylinder', 'pill', 'triangle', 'parallelogram', 'document')
);

ALTER TABLE nodes DROP CONSTRAINT IF EXISTS valid_accent;
ALTER TABLE nodes ADD CONSTRAINT valid_accent CHECK (
  accent IN ('green', 'purple', 'teal', 'blue', 'orange', 'red')
);

-- ── 2. New columns on projects ─────────────────────────────────────────────
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS workspace text NOT NULL DEFAULT 'app'
    CHECK (workspace IN ('app', 'erd'));
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS schema_source text;

-- ── 3. New columns on nodes ────────────────────────────────────────────────
ALTER TABLE nodes
  ADD COLUMN IF NOT EXISTS workspace text NOT NULL DEFAULT 'app'
    CHECK (workspace IN ('app', 'erd'));
ALTER TABLE nodes
  ADD COLUMN IF NOT EXISTS columns jsonb;
ALTER TABLE nodes
  ADD COLUMN IF NOT EXISTS table_name text;

-- ── 4. New columns on edges ────────────────────────────────────────────────
ALTER TABLE edges
  ADD COLUMN IF NOT EXISTS cardinality text
    CHECK (cardinality IS NULL OR cardinality IN ('one-to-one', 'one-to-many'));
ALTER TABLE edges
  ADD COLUMN IF NOT EXISTS from_column text;
ALTER TABLE edges
  ADD COLUMN IF NOT EXISTS to_column text;

-- ── 5. Seed demo data (idempotent) ─────────────────────────────────────────

-- 5a. App Journey demo project + nodes + edges
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM projects WHERE id = '00000000-0000-0000-0000-000000000001') THEN
    INSERT INTO projects (id, name, description, zoom, auto_layout, smart_route, workspace)
    VALUES (
      '00000000-0000-0000-0000-000000000001',
      'nextjs-supabase execution-flow.map',
      'Sample execution flow demonstrating webhook, middleware, controller, and database patterns',
      100, true, true, 'app'
    );
  END IF;

  INSERT INTO nodes (id, project_id, label, sub, shape, accent, x, y, workspace)
  VALUES
    ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000001', '/api/webhook/stripe', 'API Endpoint', 'pill', 'green', 90.0, 80.0, 'app'),
    ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000001', 'verifySignature()', 'Middleware Guard', 'diamond', 'purple', 470.0, 90.0, 'app'),
    ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-000000000001', 'processPayment()', 'Route Controller', 'rectangle', 'teal', 470.0, 360.0, 'app'),
    ('00000000-0000-0000-0000-0000000000a4', '00000000-0000-0000-0000-000000000001', 'profiles_table', 'Supabase Model', 'cylinder', 'blue', 90.0, 380.0, 'app'),
    ('00000000-0000-0000-0000-0000000000a5', '00000000-0000-0000-0000-000000000001', 'stripe.ts', 'I/O Data Block', 'parallelogram', 'orange', 280.0, 220.0, 'app'),
    ('00000000-0000-0000-0000-0000000000a6', '00000000-0000-0000-0000-000000000001', 'event.type', 'Branch Decision', 'triangle', 'red', 750.0, 220.0, 'app')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO edges (id, project_id, from_node, to_node)
  VALUES
    ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a2'),
    ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a3'),
    ('00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a4'),
    ('00000000-0000-0000-0000-0000000000b4', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a4', '00000000-0000-0000-0000-0000000000a1'),
    ('00000000-0000-0000-0000-0000000000b5', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a5'),
    ('00000000-0000-0000-0000-0000000000b6', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a6')
  ON CONFLICT (id) DO NOTHING;
END $$;

-- 5b. ERD demo project + table nodes + FK edges
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM projects WHERE id = '00000000-0000-0000-0000-000000000002') THEN
    INSERT INTO projects (id, name, description, zoom, auto_layout, smart_route, workspace, schema_source)
    VALUES (
      '00000000-0000-0000-0000-000000000002',
      'blog-schema.erd',
      'Sample database ERD demonstrating users, profiles, and posts with foreign keys',
      100, true, true, 'erd',
      'CREATE TABLE users (id SERIAL PRIMARY KEY, email TEXT UNIQUE NOT NULL); CREATE TABLE profiles (id SERIAL PRIMARY KEY, user_id INTEGER UNIQUE REFERENCES users(id), bio TEXT); CREATE TABLE posts (id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id), title TEXT NOT NULL);'
    );
  END IF;

  -- users table node
  IF NOT EXISTS (SELECT 1 FROM nodes WHERE id = '00000000-0000-0000-0000-0000000000c1') THEN
    INSERT INTO nodes (id, project_id, label, sub, shape, accent, x, y, workspace, table_name, columns)
    VALUES (
      '00000000-0000-0000-0000-0000000000c1',
      '00000000-0000-0000-0000-000000000002',
      'users', 'Table', 'cylinder', 'blue', 80.0, 80.0, 'erd', 'users',
      '[{"name":"id","type":"INTEGER","pk":true,"fk":false,"unique":false,"nullable":false},{"name":"email","type":"TEXT","pk":false,"fk":false,"unique":true,"nullable":false}]'::jsonb
    );
  END IF;

  -- profiles table node
  IF NOT EXISTS (SELECT 1 FROM nodes WHERE id = '00000000-0000-0000-0000-0000000000c2') THEN
    INSERT INTO nodes (id, project_id, label, sub, shape, accent, x, y, workspace, table_name, columns)
    VALUES (
      '00000000-0000-0000-0000-0000000000c2',
      '00000000-0000-0000-0000-000000000002',
      'profiles', 'Table', 'cylinder', 'blue', 520.0, 80.0, 'erd', 'profiles',
      '[{"name":"id","type":"INTEGER","pk":true,"fk":false,"unique":false,"nullable":false},{"name":"user_id","type":"INTEGER","pk":false,"fk":true,"unique":true,"nullable":true},{"name":"bio","type":"TEXT","pk":false,"fk":false,"unique":false,"nullable":true}]'::jsonb
    );
  END IF;

  -- posts table node
  IF NOT EXISTS (SELECT 1 FROM nodes WHERE id = '00000000-0000-0000-0000-0000000000c3') THEN
    INSERT INTO nodes (id, project_id, label, sub, shape, accent, x, y, workspace, table_name, columns)
    VALUES (
      '00000000-0000-0000-0000-0000000000c3',
      '00000000-0000-0000-0000-000000000002',
      'posts', 'Table', 'cylinder', 'blue', 520.0, 420.0, 'erd', 'posts',
      '[{"name":"id","type":"INTEGER","pk":true,"fk":false,"unique":false,"nullable":false},{"name":"user_id","type":"INTEGER","pk":false,"fk":true,"unique":false,"nullable":true},{"name":"title","type":"TEXT","pk":false,"fk":false,"unique":false,"nullable":false}]'::jsonb
    );
  END IF;

  -- FK: profiles.user_id -> users.id (1:1 because user_id is UNIQUE)
  IF NOT EXISTS (SELECT 1 FROM edges WHERE id = '00000000-0000-0000-0000-0000000000d1') THEN
    INSERT INTO edges (id, project_id, from_node, to_node, cardinality, from_column, to_column)
    VALUES (
      '00000000-0000-0000-0000-0000000000d1',
      '00000000-0000-0000-0000-000000000002',
      '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000c1',
      'one-to-one', 'user_id', 'id'
    );
  END IF;

  -- FK: posts.user_id -> users.id (1:N because user_id is not unique)
  IF NOT EXISTS (SELECT 1 FROM edges WHERE id = '00000000-0000-0000-0000-0000000000d2') THEN
    INSERT INTO edges (id, project_id, from_node, to_node, cardinality, from_column, to_column)
    VALUES (
      '00000000-0000-0000-0000-0000000000d2',
      '00000000-0000-0000-0000-000000000002',
      '00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000c1',
      'one-to-many', 'user_id', 'id'
    );
  END IF;
END $$;
