-- Drop the old constraint and add one that includes many-to-many
ALTER TABLE edges DROP CONSTRAINT IF EXISTS edges_cardinality_check;
ALTER TABLE edges ADD CONSTRAINT edges_cardinality_check
  CHECK (cardinality IS NULL OR cardinality = ANY (ARRAY['one-to-one'::text, 'one-to-many'::text, 'many-to-many'::text]));
