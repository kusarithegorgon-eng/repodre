-- Add unique constraint on (project_id, label) for upsert operations
-- This prevents duplicate nodes with the same label in a project

ALTER TABLE nodes ADD CONSTRAINT nodes_project_label_unique UNIQUE (project_id, label);