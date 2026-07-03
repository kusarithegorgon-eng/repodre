ALTER TABLE public.nodes DROP CONSTRAINT valid_shape;
ALTER TABLE public.nodes ADD CONSTRAINT valid_shape CHECK (
  shape = ANY (ARRAY[
    'rectangle'::text, 'diamond'::text, 'cylinder'::text, 'pill'::text,
    'triangle'::text, 'parallelogram'::text, 'document'::text, 'hexagon'::text
  ])
);