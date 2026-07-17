import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/lib/supabase";
import { Loader as Loader2 } from "lucide-react";

interface AuthGuardProps {
  children: React.ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const [checking, setChecking] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    let mounted = true;
    let initialSessionHandled = false;

    const handleSession = (event: string, session: any) => {
      if (!mounted) return;
      if (event === "INITIAL_SESSION") {
        initialSessionHandled = true;
        if (!session || !session.user) {
          navigate({ to: "/" });
          return;
        }
        setChecking(false);
        return;
      }

      if (!session || !session.user) {
        navigate({ to: "/" });
      } else {
        setChecking(false);
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      handleSession(event, session);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      if (initialSessionHandled) return;
      if (session && session.user) {
        setChecking(false);
      }
    });

    return () => {
      mounted = false;
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

  return <>{children}</>;
}
