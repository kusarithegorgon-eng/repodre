import { LogIn, LogOut, User } from "lucide-react";
import { useState, useEffect } from "react";
import { signInWithGitHub, signOut, type GitHubAuthState, type GitHubProfile, getGitHubProfile } from "@/lib/github-auth";

export function AuthButton() {
  const [authState, setAuthState] = useState<GitHubAuthState>({
    user: null,
    session: null,
    isLoading: true,
    error: null,
    hasRepoScope: false,
  });
  const [profile, setProfile] = useState<GitHubProfile | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  useEffect(() => {
    const unsubscribe = (window as unknown as { authListener?: () => void }).authListener;

    // Subscribe to auth state changes
    const cleanup = (window as unknown as { authListener?: () => void }).authListener;

    return () => {
      cleanup?.();
    };
  }, []);

  // Fetch GitHub profile when authenticated
  useEffect(() => {
    if (authState.session && authState.hasRepoScope) {
      getGitHubProfile().then(setProfile);
    } else {
      setProfile(null);
    }
  }, [authState.session, authState.hasRepoScope]);

  const handleSignIn = async () => {
    try {
      await signInWithGitHub();
    } catch (error) {
      console.error("Sign in failed:", error);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      setProfile(null);
      setIsDropdownOpen(false);
    } catch (error) {
      console.error("Sign out failed:", error);
    }
  };

  if (authState.isLoading) {
    return (
      <div className="flex h-9 w-24 animate-pulse items-center justify-center rounded-lg bg-surface">
        <div className="h-4 w-16 rounded bg-border" />
      </div>
    );
  }

  if (!authState.user) {
    return (
      <button
        onClick={handleSignIn}
        className="flex h-9 items-center gap-2 rounded-lg border border-border bg-surface px-4 text-sm font-medium text-foreground transition-all duration-200 hover:border-teal hover:text-teal"
      >
        <LogIn className="h-4 w-4" />
        Sign in
      </button>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
        className="flex h-9 items-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm font-medium text-foreground transition-all duration-200 hover:border-teal"
      >
        {profile?.avatar_url ? (
          <img
            src={profile.avatar_url}
            alt={profile.login}
            className="h-6 w-6 rounded-full"
          />
        ) : (
          <User className="h-4 w-4" />
        )}
        <span className="max-w-[120px] truncate">{profile?.login || "User"}</span>
        {!authState.hasRepoScope && (
          <span className="ml-1 rounded bg-yellow-500/20 px-1.5 py-0.5 text-[10px] text-yellow-600">
            Limited
          </span>
        )}
      </button>

      {isDropdownOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsDropdownOpen(false)}
          />
          <div className="absolute right-0 top-full z-20 mt-2 w-56 rounded-lg border border-border bg-popover p-2 shadow-xl">
            {profile && (
              <div className="mb-2 border-b border-border px-2 py-2">
                <p className="font-medium text-foreground">{profile.name || profile.login}</p>
                <p className="text-xs text-muted-foreground">{profile.public_repos} public repos</p>
              </div>
            )}
            {!authState.hasRepoScope && (
              <button
                onClick={handleSignIn}
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-yellow-600 transition-colors hover:bg-accent"
              >
                <LogIn className="h-4 w-4" />
                Grant repo access
              </button>
            )}
            <button
              onClick={handleSignOut}
              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
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
