/*
# Fix Security Issues: Function Search Path, SECURITY DEFINER Exposure

## Purpose
Address three security vulnerabilities flagged by Supabase's security
scanner:

1. **Function Search Path Mutable** — `can_edit_project` and
   `is_project_admin` had mutable `search_path`, allowing a malicious user
   to hijack function behavior by manipulating the search path. Fixed by
   adding `SET search_path = public` to both function definitions.

2. **Public / Signed-In Users Can Execute SECURITY DEFINER Function** —
   Both functions were `SECURITY DEFINER` (run with the function owner's
   privileges) and were callable by `anon` and `authenticated` roles via
   `/rest/v1/rpc/...`. This is unnecessary because:
   - The functions only read `project_members` (which the caller already
     has RLS-governed access to).
   - They are intended as internal RLS policy helpers, not public API
     endpoints.
   Fixed by switching both to `SECURITY INVOKER` (run with the caller's
   privileges) and explicitly revoking `EXECUTE` from `PUBLIC` and `anon`.

## Changes

### Functions modified
- `public.can_edit_project(uuid)` — now `SECURITY INVOKER` with
  `SET search_path = public`
- `public.is_project_admin(uuid)` — now `SECURITY INVOKER` with
  `SET search_path = public`

### Grants
- `REVOKE EXECUTE ON FUNCTION ... FROM PUBLIC` — removes default public
  execute access
- `REVOKE EXECUTE ON FUNCTION ... FROM anon` — removes anon execute access
  (belt-and-suspenders; PUBLIC already covers this)
- `GRANT EXECUTE ON FUNCTION ... TO authenticated` — retained so RLS
  policies that reference these functions still work for signed-in users

## Security model after this migration
- `anon` role: CANNOT execute either function (no direct RPC access)
- `authenticated` role: CAN execute both functions (needed for RLS policy
  evaluation during INSERT/UPDATE/DELETE on nodes and edges)
- Both functions run with the **caller's** privileges (SECURITY INVOKER),
  not the function owner's privileges
- Both functions have an immutable `search_path = public`, preventing
  search-path hijacking

## Important notes
1. RLS policies on `nodes` and `edges` reference these functions. Since
   RLS policies run as the calling user (not SECURITY DEFINER), switching
   to SECURITY INVOKER does not change RLS behavior — the functions were
   always evaluated in the user's context during policy checks.
2. The `project_members` table has RLS enabled, so when an `authenticated`
   user calls these functions, the inner `SELECT 1 FROM project_members`
   subquery is subject to that user's RLS policies on `project_members`.
   This is correct and safe — a user can only "see" membership rows they
   are allowed to see, which is exactly the access control we want.
3. The "Leaked Password Protection" setting is a Supabase Auth
   configuration that must be enabled in the Supabase Dashboard under
   Authentication > Settings. It cannot be toggled via SQL migration.
*/

-- =========================================================================
-- 1. Recreate can_edit_project as SECURITY INVOKER with fixed search_path
-- =========================================================================
CREATE OR REPLACE FUNCTION public.can_edit_project(project_uuid uuid)
RETURNS boolean
LANGUAGE sql
SECURITY INVOKER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_members pm
    WHERE pm.project_id = project_uuid
      AND pm.user_id = auth.uid()
      AND pm.role IN ('ADMIN', 'EDITOR')
  );
$$;

-- =========================================================================
-- 2. Recreate is_project_admin as SECURITY INVOKER with fixed search_path
-- =========================================================================
CREATE OR REPLACE FUNCTION public.is_project_admin(project_uuid uuid)
RETURNS boolean
LANGUAGE sql
SECURITY INVOKER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_members pm
    WHERE pm.project_id = project_uuid
      AND pm.user_id = auth.uid()
      AND pm.role = 'ADMIN'
  );
$$;

-- =========================================================================
-- 3. Revoke public/anon execute access
-- =========================================================================
REVOKE EXECUTE ON FUNCTION public.can_edit_project(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_project_admin(uuid) FROM PUBLIC;

-- Explicitly revoke from anon (redundant with PUBLIC but explicit for clarity)
REVOKE EXECUTE ON FUNCTION public.can_edit_project(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_project_admin(uuid) FROM anon;

-- Re-grant to authenticated (needed for RLS policy evaluation)
GRANT EXECUTE ON FUNCTION public.can_edit_project(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_project_admin(uuid) TO authenticated;