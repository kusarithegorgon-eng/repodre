import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/lib/supabase";
import { Loader as Loader2 } from "lucide-react";

interface AuthGuardProps {
  children: React.ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const [checking, setChecking] = useState(true);
  const [timedOut, setTimedOut] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    let mounted = true;
    const timeout = window.setTimeout(() => {
      if (!mounted) return;
      setChecking(false);
      setTimedOut(true);
    }, 5000);

    // Fast path: if a session already exists, render immediately without
    // waiting for the next auth event. This avoids a hang when the OAuth
    // callback has already established a session before /dashboard mounts.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      if (session?.user) {
        setChecking(false);
      } else {
        // Not authenticated — redirect to landing. Do NOT sign the user out;
        // /dashboard simply requires an active session.
        navigate({ to: "/", replace: true });
      }
    });

    const subscription = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;

      if (event === "SIGNED_IN" && session?.user) {
        setChecking(false);
        return;
      }

      if (event === "SIGNED_OUT") {
        // User signed out elsewhere — redirect to landing, do not call
        // signOut() here; the sign-out itself is the source of this event.
        navigate({ to: "/", replace: true });
      }
    });

    return () => {
      mounted = false;
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, [navigate]);

  if (checking) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-teal" />
      </div>
    );
  }

  if (timedOut) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center bg-background text-foreground">
        <p className="text-lg font-medium">Taking too long to authenticate.</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Your session could not be validated within 5 seconds.
        </p>
        <button
          onClick={() => navigate({ to: "/", replace: true })}
          className="mt-4 rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:border-teal hover:text-foreground"
        >
          Return to Login
        </button>
      </div>
    );
  }

  return <>{children}</>;
}
