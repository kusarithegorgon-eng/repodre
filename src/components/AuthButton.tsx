import { LogIn, LogOut, User } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { signInWithGitHub, signOut } from "@/lib/github-auth";
import type { User as SupabaseUser } from "@supabase/supabase-js";

interface GitHubMeta {
  login?: string;
  avatar_url?: string;
  name?: string;
}

export function AuthButton() {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    let mounted = true;

    // Subscribe first — onAuthStateChange fires INITIAL_SESSION on mount
    // which catches the session set by the OAuth callback redirect.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) {
        setUser(session?.user ?? null);
        setIsLoading(false);
      }
    });

    // getSession() reads localStorage without a network round-trip, so it's
    // safe to use as a fast initial hydration in case the event fires late.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (mounted) {
        setUser(session?.user ?? null);
        setIsLoading(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const meta = user?.user_metadata as GitHubMeta | undefined;
  const login = meta?.login || user?.email?.split("@")[0] || "User";
  const avatar = meta?.avatar_url;

  const handleSignIn = async () => {
    try {
      await signInWithGitHub();
    } catch (err) {
      console.error("Sign in failed:", err);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      setIsOpen(false);
    } catch (err) {
      console.error("Sign out failed:", err);
    }
  };

  if (isLoading) {
    return (
      <div className="h-9 w-24 animate-pulse rounded-lg bg-surface border border-border" />
    );
  }

  if (!user) {
    return (
      <button
        onClick={handleSignIn}
        className="flex h-9 items-center gap-2 rounded-lg border border-border bg-surface px-4 text-sm font-medium text-foreground transition-all duration-200 hover:border-teal hover:text-teal"
      >
        <LogIn className="h-4 w-4" />
        Sign in with GitHub
      </button>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex h-9 items-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm font-medium transition-all hover:border-teal"
      >
        {avatar ? (
          <img src={avatar} alt={login} className="h-6 w-6 rounded-full" />
        ) : (
          <User className="h-4 w-4" />
        )}
        <span className="max-w-[100px] truncate">{login}</span>
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 top-full z-20 mt-2 w-48 rounded-lg border border-border bg-popover p-2 shadow-xl">
            <button
              onClick={handleSignOut}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </div>
        </>
      )}
    </div>
  );
}
