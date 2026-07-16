/*
# Auto-create ADMIN membership on project insert

## Problem
When a project is created, the client must insert a row into `project_members`
for the creator as ADMIN. This second HTTP request can fail silently (RLS timing,
network error, etc.), leaving the project with 0 members. Then all subsequent
node/edge inserts fail the `can_edit_project()` RLS check, and the user sees
an empty project in Recents.

## Solution
Add a `BEFORE INSERT` trigger on `projects` that automatically inserts an ADMIN
membership row for the project creator (`auth.uid()`). This guarantees the
membership exists before any node/edge insert is attempted, eliminating the
race condition.

## Changes
1. Create function `auto_create_admin_membership()` that inserts into
   `project_members` with role 'ADMIN' for the new project's creator.
2. Create trigger `trg_auto_admin_membership` on `projects` BEFORE INSERT.
3. The trigger runs with SECURITY DEFINER (definer = owner, typically postgres)
   so it can insert into `project_members` regardless of the caller's RLS.
*/

CREATE OR REPLACE FUNCTION public.auto_create_admin_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  IF NEW.user_id IS NOT NULL THEN
    INSERT INTO public.project_members (project_id, user_id, email, role)
    VALUES (
      NEW.id,
      NEW.user_id,
      COALESCE(
        (SELECT email FROM auth.users WHERE id = NEW.user_id),
        ''
      ),
      'ADMIN'
    )
    ON CONFLICT (project_id, user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_admin_membership ON public.projects;
CREATE TRIGGER trg_auto_admin_membership
  BEFORE INSERT ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_create_admin_membership();
