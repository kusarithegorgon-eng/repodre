/*
# Reset nodes and edges row-level security policies

This migration restores permissive graph policies for `nodes` and `edges` so
that canvas data can be inserted and loaded without recursive membership
policy conflicts.
*/

ALTER TABLE IF EXISTS nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS edges ENABLE ROW LEVEL SECURITY;

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
