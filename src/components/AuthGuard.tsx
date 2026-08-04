import { useEffect, useRef, useState } from "react";
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
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let mounted = true;

    // 5-second safety net — only fires if session check AND auth events both
    // fail to resolve within that window.
    timeoutRef.current = setTimeout(() => {
      if (!mounted) return;
      setChecking(false);
      setTimedOut(true);
    }, 5000);

    const clearSafetyTimeout = () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };

    // Fast path: getSession() reads from localStorage with no network round-trip.
    // If a session already exists, allow through immediately.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      if (session?.user) {
        clearSafetyTimeout();
        setChecking(false);
      } else {
        // No session — don't sign out, just redirect to landing.
        clearSafetyTimeout();
        navigate({ to: "/", replace: true });
      }
    });

    // Also watch for live auth events (e.g. SIGNED_IN fires just after the
    // OAuth callback establishes a session).
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;

      if ((event === "SIGNED_IN" || event === "INITIAL_SESSION") && session?.user) {
        clearSafetyTimeout();
        setChecking(false);
        return;
      }

      if (event === "SIGNED_OUT") {
        clearSafetyTimeout();
        navigate({ to: "/", replace: true });
      }
    });

    return () => {
      mounted = false;
      clearSafetyTimeout();
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
