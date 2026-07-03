/**
 * GitHub OAuth Integration
 *
 * Handles GitHub authentication via Supabase with 'repo' scope for
 * accessing both public and private repositories.
 */

import { supabase } from "./supabase";
import type { User, Session } from "@supabase/supabase-js";

export interface GitHubAuthState {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  error: string | null;
  hasRepoScope: boolean;
}

const GITHUB_PROVIDER = "github";
const REDIRECT_TO = window.location.origin + "/auth/callback";

/**
 * Initiate GitHub OAuth flow with repo scope for full repository access.
 * The 'repo' scope grants read/write access to public and private repos.
 */
export async function signInWithGitHub(): Promise<void> {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: GITHUB_PROVIDER,
    options: {
      scopes: "repo",
      redirectTo: REDIRECT_TO,
    },
  });

  if (error) {
    console.error("GitHub OAuth error:", error.message);
    throw error;
  }
}

/**
 * Sign out the current user and clear the session.
 */
export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) {
    console.error("Sign out error:", error.message);
    throw error;
  }
}

/**
 * Get the current authenticated session.
 */
export async function getCurrentSession(): Promise<Session | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session;
}

/**
 * Get the current authenticated user.
 */
export async function getCurrentUser(): Promise<User | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/**
 * Extract the GitHub access token from the provider token.
 * Supabase stores the provider token in session.provider_token.
 */
export async function getGitHubAccessToken(): Promise<string | null> {
  // The session may not be fully hydrated immediately after the OAuth callback.
  // Retry a few times with a short delay before giving up.
  for (let attempt = 0; attempt < 5; attempt++) {
    const session = await getCurrentSession();
    if (session) {
      const providerToken = session.provider_token;
      if (typeof providerToken === "string" && providerToken.length > 0) {
        return providerToken;
      }
      const user = await getCurrentUser();
      if (user?.user_metadata?.provider_token) {
        return user.user_metadata.provider_token;
      }
    }
    if (attempt < 4) await new Promise((r) => setTimeout(r, 200));
  }
  return null;
}

/**
 * Check if the current session has the required 'repo' scope.
 * We verify this by attempting a repo-scoped API call.
 */
export async function verifyRepoScope(): Promise<boolean> {
  const token = await getGitHubAccessToken();
  if (!token) return false;

  try {
    // Test the token by fetching the authenticated user's repos
    const response = await fetch("https://api.github.com/user/repos?per_page=1", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
      },
    });

    // If we can access repos, the token has appropriate scope
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Subscribe to auth state changes.
 * Returns an unsubscribe function.
 */
export function onAuthStateChange(
  callback: (state: GitHubAuthState) => void
): () => void {
  let mounted = true;

  // Initial state fetch
  (async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const hasRepoScope = session ? await verifyRepoScope() : false;

    if (mounted) {
      callback({
        user,
        session,
        isLoading: false,
        error: null,
        hasRepoScope,
      });
    }
  })();

  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange(async (event, session) => {
    if (!mounted) return;

    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Emit immediately so the UI doesn't wait on a GitHub API round-trip
    callback({
      user,
      session,
      isLoading: false,
      error: null,
      hasRepoScope: false,
    });

    // Verify repo scope asynchronously, then patch the state
    if (session) {
      verifyRepoScope().then((hasRepoScope) => {
        if (mounted && hasRepoScope) {
          callback({
            user,
            session,
            isLoading: false,
            error: null,
            hasRepoScope,
          });
        }
      });
    }
  });

  return () => {
    mounted = false;
    subscription.unsubscribe();
  };
}

/**
 * Handle OAuth callback after GitHub redirect.
 * Call this on the callback route to complete the auth flow.
 */
export async function handleAuthCallback(): Promise<Session | null> {
  // The session is automatically established by Supabase when the callback URL is hit.
  // The exchangeCodeForSession method handles PKCE flow.
  const { data, error } = await supabase.auth.exchangeCodeForSession(
    new URLSearchParams(window.location.search).get("code") ?? ""
  );

  if (error) {
    console.error("Auth callback error:", error.message);
    throw error;
  }

  return data.session;
}

/**
 * Get the user's GitHub profile information.
 */
export interface GitHubProfile {
  login: string;
  avatar_url: string;
  html_url: string;
  name: string | null;
  bio: string | null;
  public_repos: number;
}

export async function getGitHubProfile(): Promise<GitHubProfile | null> {
  const token = await getGitHubAccessToken();
  if (!token) return null;

  try {
    const response = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
      },
    });

    if (!response.ok) return null;

    return await response.json();
  } catch {
    return null;
  }
}
