/*
# Restore has_edit_share EXECUTE for RLS policy evaluation

## Problem
Migration 025 revoked EXECUTE on public.has_edit_share(uuid) from
PUBLIC, anon, and authenticated to prevent direct RPC calls.
However, RLS policies on `nodes` and `edges` call has_edit_share(project_id)
as part of their WITH CHECK / USING clauses. When those policies are
evaluated for an `anon` or `authenticated` session, Postgres executes
the function in that role's context. With EXECUTE revoked, every INSERT
and UPDATE on nodes/edges returns a 403 permission denied error.

## Fix
Re-grant EXECUTE to anon and authenticated. This is safe because the
function is now SECURITY INVOKER — it runs as the calling role, not as
the function owner — so calling it via RPC is no worse than querying
project_shares directly (which is already publicly readable via
anon_lookup_share_by_id / auth_lookup_share_by_id SELECT policies).

## Security posture
- has_edit_share: SECURITY INVOKER + SET search_path (no escalation risk)
- auto_create_admin_membership: still REVOKE'd — it is a trigger function
  and does not need to be callable via RPC by any role.
*/

GRANT EXECUTE ON FUNCTION public.has_edit_share(uuid) TO anon, authenticated;
