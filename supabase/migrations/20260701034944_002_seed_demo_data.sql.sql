/*
# Seed initial canvas data

1. Creates a demo project "nextjs-supabase execution flow" matching the studio UI
2. Inserts 4 sample nodes representing API endpoints, middleware, controllers, and database
3. Inserts 4 edges connecting the nodes in a flow pattern

This matches the INITIAL_NODES and INITIAL_EDGES from studio.tsx.
*/

INSERT INTO projects (id, name, description, zoom, auto_layout, smart_route)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'nextjs-supabase execution-flow.map',
  'Sample execution flow demonstrating webhook, middleware, controller, and database patterns',
  100,
  true,
  true
);

INSERT INTO nodes (id, project_id, label, sub, shape, accent, x, y)
VALUES
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000001', '/api/webhook/stripe', 'API Endpoint', 'pill', 'green', 90.0, 80.0),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000001', 'verifySignature()', 'Middleware Guard', 'diamond', 'purple', 470.0, 90.0),
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-000000000001', 'processPayment()', 'Route Controller', 'rectangle', 'teal', 470.0, 360.0),
  ('00000000-0000-0000-0000-0000000000a4', '00000000-0000-0000-0000-000000000001', 'profiles_table', 'Supabase Model', 'cylinder', 'blue', 90.0, 380.0);

INSERT INTO edges (id, project_id, from_node, to_node)
VALUES
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a2'),
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a3'),
  ('00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a4'),
  ('00000000-0000-0000-0000-0000000000b4', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a4', '00000000-0000-0000-0000-0000000000a1');