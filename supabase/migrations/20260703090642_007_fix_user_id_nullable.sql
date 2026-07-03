-- Fix: user_id was NOT NULL with DEFAULT auth.uid(), which causes 400 errors
-- for anonymous users because auth.uid() returns NULL for unauthenticated sessions.
-- This app uses a shared-canvas model (RLS allows anon + authenticated via USING (true)),
-- so user_id should be nullable to support both auth states.

ALTER TABLE projects ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE nodes    ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE edges    ALTER COLUMN user_id DROP NOT NULL;
