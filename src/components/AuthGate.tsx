import { useEffect, useState } from "react";
import { RepodreLogo } from "@/components/RepodreLogo";
import { AuthButton } from "@/components/AuthButton";
import { supabase } from "@/lib/supabase";

interface AuthGateProps {
  children: React.ReactNode;
}

export function AuthGate({ children }: AuthGateProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!mounted) return;
      setIsAuthenticated(Boolean(session?.user));
      setChecked(true);
    })();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(Boolean(session?.user));
      setChecked(true);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (!isAuthenticated) {
    // Primary UI: show sign-in CTA centered
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="mx-auto max-w-md text-center">
          <RepodreLogo className="mx-auto mb-6 h-16 w-16" />
          <h2 className="mb-4 text-2xl font-semibold">Sign in to continue</h2>
          <p className="mb-6 text-sm text-muted-foreground">You must sign in with GitHub to analyze repositories and access projects.</p>
          <div className="flex items-center justify-center">
            <AuthButton />
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
