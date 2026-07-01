/*
# Expand shape and accent vocabulary

1. Changes to `nodes` table
   - `shape` constraint updated: adds 'triangle', 'parallelogram', 'document'
     alongside existing rectangle / diamond / cylinder / pill.
   - `accent` constraint updated: adds 'orange', 'red' alongside the four
     existing colours, supporting the full StudioPage palette.

2. Seed additions
   - Two new demo nodes (n5=parallelogram/I-O block, n6=triangle/branch)
     and two new edges connecting them, so the studio demo immediately
     shows all new shape types.

3. Security
   - No RLS changes. Existing anon+authenticated policies on `nodes` and
     `edges` already cover the new rows.

4. Notes
   - The old constraint is dropped before the new one is added.
     Postgres does not support IF NOT EXISTS on CHECK constraints.
   - The migration is idempotent: DO $$ blocks guard each INSERT.
*/

-- ── Expand valid_shape ─────────────────────────────────────────────────────
ALTER TABLE nodes DROP CONSTRAINT IF EXISTS valid_shape;
ALTER TABLE nodes ADD CONSTRAINT valid_shape CHECK (
  shape IN ('rectangle', 'diamond', 'cylinder', 'pill', 'triangle', 'parallelogram', 'document')
);

-- ── Expand valid_accent ────────────────────────────────────────────────────
ALTER TABLE nodes DROP CONSTRAINT IF EXISTS valid_accent;
ALTER TABLE nodes ADD CONSTRAINT valid_accent CHECK (
  accent IN ('green', 'purple', 'teal', 'blue', 'orange', 'red')
);

-- ── Insert two new demo nodes (idempotent) ─────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM nodes WHERE id = '00000000-0000-0000-0000-0000000000a5'
  ) THEN
    INSERT INTO nodes (id, project_id, label, sub, shape, accent, x, y)
    VALUES (
      '00000000-0000-0000-0000-0000000000a5',
      '00000000-0000-0000-0000-000000000001',
      'stripe.ts',
      'I/O Data Block',
      'parallelogram',
      'orange',
      280.0,
      220.0
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM nodes WHERE id = '00000000-0000-0000-0000-0000000000a6'
  ) THEN
    INSERT INTO nodes (id, project_id, label, sub, shape, accent, x, y)
    VALUES (
      '00000000-0000-0000-0000-0000000000a6',
      '00000000-0000-0000-0000-000000000001',
      'event.type',
      'Branch Decision',
      'triangle',
      'red',
      750.0,
      220.0
    );
  END IF;
END $$;

-- ── Insert two new demo edges (idempotent) ─────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM edges WHERE id = '00000000-0000-0000-0000-0000000000b5'
  ) THEN
    INSERT INTO edges (id, project_id, from_node, to_node)
    VALUES (
      '00000000-0000-0000-0000-0000000000b5',
      '00000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-0000000000a1',
      '00000000-0000-0000-0000-0000000000a5'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM edges WHERE id = '00000000-0000-0000-0000-0000000000b6'
  ) THEN
    INSERT INTO edges (id, project_id, from_node, to_node)
    VALUES (
      '00000000-0000-0000-0000-0000000000b6',
      '00000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-0000000000a2',
      '00000000-0000-0000-0000-0000000000a6'
    );
  END IF;
END $$;