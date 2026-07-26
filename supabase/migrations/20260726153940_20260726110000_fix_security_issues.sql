-- Fix: Function Search Path Mutable
-- Pin the search_path so a hostile role can't hijack schema resolution.
CREATE OR REPLACE FUNCTION public.handle_new_user_subscription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  INSERT INTO user_subscriptions (user_id, tier, status)
  VALUES (NEW.id, 'free', 'active')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$function$;

-- Fix: Public Can Execute SECURITY DEFINER Function
-- Fix: Signed-In Users Can Execute SECURITY DEFINER Function
-- The function is a trigger (fired by the auth schema), so it must NOT be
-- callable over the REST/RPC surface by anon or authenticated roles.
REVOKE EXECUTE ON FUNCTION public.handle_new_user_subscription() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_subscription() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_subscription() FROM authenticated;

-- Keep service_role (needed for admin operations) and postgres.
GRANT EXECUTE ON FUNCTION public.handle_new_user_subscription() TO service_role;
