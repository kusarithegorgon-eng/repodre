-- Add 'circle' shape (used by bridge/section-break nodes in the journey graph)
ALTER TABLE nodes DROP CONSTRAINT IF EXISTS valid_shape;
ALTER TABLE nodes ADD CONSTRAINT valid_shape CHECK (
  shape IN ('rectangle', 'diamond', 'cylinder', 'pill', 'triangle', 'parallelogram', 'document', 'hexagon', 'circle')
);

-- Add 'slate' accent (used by bridge nodes in the journey graph)
ALTER TABLE nodes DROP CONSTRAINT IF EXISTS valid_accent;
ALTER TABLE nodes ADD CONSTRAINT valid_accent CHECK (
  accent IN ('green', 'purple', 'teal', 'blue', 'orange', 'red', 'slate')
);