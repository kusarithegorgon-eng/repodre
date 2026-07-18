import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader as Loader2, CircleCheck as CheckCircle, Circle as XCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";

function getOAuthError(): string | null {
  // Supabase sends errors in both query params and hash fragment
  const params = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.slice(1));
  const description = params.get("error_description") ?? hash.get("error_description");
  const code = params.get("error_code") ?? hash.get("error_code");
  if (description) {
    return decodeURIComponent(description.replace(/\+/g, " ")) + (code ? ` (${code})` : "");
  }
  return params.get("error") ?? hash.get("error") ?? null;
}

export function AuthCallbackPage() {
  const navigate = useNavigate();
  const oauthError = getOAuthError();
  const [status, setStatus] = useState<"loading" | "success" | "error">(
    oauthError ? "error" : "loading"
  );
  const [error, setError] = useState<string | null>(oauthError);

  useEffect(() => {
    if (oauthError) return;

    let mounted = true;
    let redirected = false;
    let subscription: { unsubscribe: () => void } | null = null;

    const handleRedirect = (session: any) => {
      if (!mounted || redirected) return;
      if (session?.user) {
        redirected = true;
        setStatus("success");
        // replace: true so the browser back button does not return to the
        // OAuth callback URL and re-trigger the handshake.
        navigate({ to: "/dashboard", replace: true });
      }
    };

    const watchSession = async () => {
      // Fast path: if a session already exists (e.g. user navigated back
      // to /auth/callback after a successful sign-in), redirect immediately
      // without waiting for another SIGNED_IN event.
      const { data: { session } } = await supabase.auth.getSession();
      if (!mounted) return;
      handleRedirect(session);

      if (!redirected) {
        subscription = supabase.auth.onAuthStateChange((event, session) => {
          if (event === "SIGNED_IN" || event === "INITIAL_SESSION") {
            handleRedirect(session);
          }
          if (event === "SIGNED_OUT") {
            if (!redirected) {
              setStatus("error");
              setError("Authentication failed. Please try signing in again.");
            }
          }
        }).data.subscription;
      }
    };

    watchSession();

    const timeout = window.setTimeout(async () => {
      if (!mounted || redirected) return;
      const { data: { session } } = await supabase.auth.getSession();
      if (!mounted) return;
      if (session?.user) {
        handleRedirect(session);
      } else {
        setStatus("error");
        setError("Sign in timed out. Please return to login and try again.");
      }
    }, 5000);

    return () => {
      mounted = false;
      clearTimeout(timeout);
      subscription?.unsubscribe();
    };
  }, [navigate, oauthError]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background text-foreground">
      <div className="text-center">
        {status === "loading" && (
          <>
            <Loader2 className="mx-auto h-12 w-12 animate-spin text-teal" />
            <p className="mt-4 text-lg text-muted-foreground">Completing sign in...</p>
          </>
        )}

        {status === "success" && (
          <>
            <CheckCircle className="mx-auto h-12 w-12 text-teal" />
            <p className="mt-4 text-lg text-foreground">Successfully signed in!</p>
            <p className="mt-2 text-sm text-muted-foreground">Redirecting...</p>
          </>
        )}

        {status === "error" && (
          <>
            <XCircle className="mx-auto h-12 w-12 text-red-500" />
            <p className="mt-4 text-lg text-foreground">Sign in failed</p>
            <p className="mt-2 max-w-sm text-sm text-red-500">{error}</p>
            {oauthError && (
              <p className="mt-2 max-w-sm text-xs text-muted-foreground">
                This is a GitHub OAuth configuration issue. Make sure the GitHub OAuth App callback URL in Supabase matches your deployed URL.
              </p>
            )}
            <div className="mt-4 flex items-center justify-center gap-3">
              <button
                onClick={() => navigate({ to: "/" })}
                className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:border-teal hover:text-foreground"
              >
                Return to Login
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
