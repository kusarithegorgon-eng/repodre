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
const GH_TOKEN_STORAGE_KEY = "gh_provider_token";

/**
 * Cache (or clear) the GitHub provider token in localStorage so it survives
 * full page reloads. Supabase only returns provider_token at the moment a
 * session is first established (OAuth exchange / token refresh) — it is not
 * persisted in the Supabase session itself, so we have to stash it ourselves.
 */
function cacheProviderToken(token: string | null | undefined): void {
  try {
    if (typeof token === "string" && token.length > 0) {
      localStorage.setItem(GH_TOKEN_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(GH_TOKEN_STORAGE_KEY);
    }
  } catch (err) {
    // localStorage can throw in Safari private browsing, locked-down
    // corporate browsers, or when storage quota is exceeded. Losing the
    // cached token in these environments is an acceptable degradation —
    // an uncaught exception here is not.
    console.warn("Unable to persist GitHub provider token:", err);
  }
}

/**
 * Read the cached GitHub provider token from localStorage, if any.
 * Wrapped in try/catch for the same reasons as cacheProviderToken.
 */
function readCachedProviderToken(): string | null {
  try {
    return localStorage.getItem(GH_TOKEN_STORAGE_KEY);
  } catch (err) {
    console.warn("Unable to read cached GitHub provider token:", err);
    return null;
  }
}

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
  cacheProviderToken(null);
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
  const session = await getCurrentSession();

  // Supabase stores the GitHub OAuth token in provider_token, but only right
  // after the session is (re)established — it's not preserved across page
  // reloads by Supabase itself. Cache it whenever we do see it.
  const providerToken = session?.provider_token;
  if (typeof providerToken === "string" && providerToken.length > 0) {
    cacheProviderToken(providerToken);
    return providerToken;
  }

  // Fallback: check user metadata for GitHub token
  if (session) {
    const user = await getCurrentUser();
    if (user?.user_metadata?.provider_token) {
      const metadataToken = user.user_metadata.provider_token as string;
      cacheProviderToken(metadataToken);
      return metadataToken;
    }
  }

  // Definitive fallback: a token cached from a previous session. This
  // intentionally does NOT require `session` to be truthy — right after a
  // page reload, Supabase's session can take a moment to rehydrate (or may
  // have dropped provider_token even though the session itself is valid), so
  // gating this on `session` would reintroduce the "works, then null after
  // refresh" bug. Note this also means a stale/revoked token can be returned
  // here; verifyRepoScope(), or a 401 from a downstream API call, is the
  // signal to clear it.
  return readCachedProviderToken();
}

/**
 * If a GitHub API response indicates the token is dead (401 Unauthorized —
 * bad/expired token, or 403 Forbidden — revoked/insufficient scope), clear
 * the cached provider token so we stop silently reusing it. Returns true if
 * the response was an auth failure.
 *
 * Note: 403 can also mean rate limiting, not just revocation. We still clear
 * the cache in that case — worst case the user has to re-auth once, which is
 * far better than getting stuck in a silent-failure loop with a dead token.
 */
function handleAuthFailure(response: Response): boolean {
  if (response.status === 401 || response.status === 403) {
    cacheProviderToken(null);
    return true;
  }
  return false;
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

    if (handleAuthFailure(response)) return false;

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
    if (session?.provider_token) cacheProviderToken(session.provider_token);
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
    // Only cache when this event actually carries a fresh token — some
    // events (e.g. a plain TOKEN_REFRESHED) may not include provider_token,
    // and we don't want to blow away a still-good cached value in that case.
    if (session?.provider_token) cacheProviderToken(session.provider_token);
    if (event === "SIGNED_OUT") cacheProviderToken(null);
    const hasRepoScope = session ? await verifyRepoScope() : false;

    callback({
      user,
      session,
      isLoading: event === "INITIAL_SESSION",
      error: null,
      hasRepoScope,
    });
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

  cacheProviderToken(data.session?.provider_token);

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

    if (handleAuthFailure(response)) return null;
    if (!response.ok) return null;

    return await response.json();
  } catch {
    return null;
  }
}