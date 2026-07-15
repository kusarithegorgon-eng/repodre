/*
# Fix privilege escalation in user_roles table

## Problem
The `insert_own_user_role` policy allows any authenticated user to insert
ANY role value for themselves, including 'admin'. This allows privilege
escalation where any user can self-assign admin rights.

## Fix
1. Drop the existing `insert_own_user_role` INSERT policy.
2. Recreate it with a WITH CHECK that restricts the role to 'viewer' only.
3. Drop the `update_own_user_role` UPDATE policy (users should not be able
   to change their own role at all — only admins/service-role can).
*/
DROP POLICY IF EXISTS "insert_own_user_role" ON user_roles;
DROP POLICY IF EXISTS "update_own_user_role" ON user_roles;

-- Allow users to insert only the 'viewer' role for themselves
CREATE POLICY "insert_own_user_role" ON user_roles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id AND role = 'viewer');

-- No UPDATE policy: users cannot change their own role.
-- Role changes must go through an admin/service-role edge function.
