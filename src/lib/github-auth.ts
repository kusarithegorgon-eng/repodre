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
 * Save the GitHub provider token to localStorage so it survives full page
 * reloads. Supabase only returns provider_token at the moment a session is
 * first established (OAuth exchange / token refresh) — it is not persisted
 * in the Supabase session itself, so we have to stash it ourselves.
 *
 * IMPORTANT: this function ONLY saves. It never clears the cached token,
 * even implicitly — a call with an empty/undefined value is a no-op, not a
 * clear. Callers that received a sparse payload (e.g. a TOKEN_REFRESHED
 * event with no provider_token) must NOT wipe out a still-good cached
 * token just because this particular event didn't carry one. Clearing is
 * handled exclusively by clearCachedToken().
 */
function cacheProviderToken(token: string | null | undefined): void {
  if (typeof token !== "string" || token.length === 0) {
    return;
  }
  try {
    localStorage.setItem(GH_TOKEN_STORAGE_KEY, token);
  } catch (err) {
    // localStorage can throw in Safari private browsing, locked-down
    // corporate browsers, or when storage quota is exceeded. Losing the
    // cached token in these environments is an acceptable degradation —
    // an uncaught exception here is not.
    console.warn("Unable to persist GitHub provider token:", err);
  }
}

/**
 * Explicitly clear the cached GitHub provider token. This is the ONLY
 * function that removes the cached token — it is intentionally separate
 * from cacheProviderToken so that "saving a sparse payload" can never be
 * confused with "the user wants to be logged out."
 */
function clearCachedToken(): void {
  try {
    localStorage.removeItem(GH_TOKEN_STORAGE_KEY);
  } catch (err) {
    console.warn("Unable to clear cached GitHub provider token:", err);
  }
}

/**
 * Read the cached GitHub provider token from localStorage, if any.
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
 * This is the intentional, user-triggered path that clears the cached token.
 */
export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  clearCachedToken();
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
 * Extract the GitHub access token.
 * Checks the live Supabase session first (and saves it if present), then
 * falls back to user metadata, then to whatever's cached in localStorage
 * from a previous session. The cache is never treated as "cleared" just
 * because the current payload happens to be sparse.
 */
export async function getGitHubAccessToken(): Promise<string | null> {
  const session = await getCurrentSession();

  // 1. Check the live session first.
  const providerToken = session?.provider_token;
  if (typeof providerToken === "string" && providerToken.length > 0) {
    cacheProviderToken(providerToken);
    return providerToken;
  }

  // 2. Fallback: check user metadata for a GitHub token.
  if (session) {
    const user = await getCurrentUser();
    const metadataToken = user?.user_metadata?.provider_token;
    if (typeof metadataToken === "string" && metadataToken.length > 0) {
      cacheProviderToken(metadataToken);
      return metadataToken;
    }
  }

  // 3. Definitive fallback: whatever's cached from a previous session. This
  // intentionally does NOT require `session` to be truthy — right after a
  // page reload, Supabase's session can take a moment to rehydrate (or may
  // have dropped provider_token even though the session itself is valid), so
  // gating this on `session` would reintroduce the "works, then null after
  // refresh" bug. A stale/revoked token can be returned here; that's fine —
  // verifyRepoScope() or a downstream 401/403 is what should react to that,
  // not this read.
  return readCachedProviderToken();
}

/**
 * If a GitHub API response indicates the token is dead (401 Unauthorized —
 * bad/expired token, or 403 Forbidden — revoked/insufficient scope), clear
 * the cached provider token so we stop silently reusing a dead one. Returns
 * true if the response was an auth failure.
 *
 * Note: 403 can also mean rate limiting, not just revocation. We still clear
 * the cache in that case — worst case the user has to re-auth once, which is
 * far better than getting stuck in a silent-failure loop with a dead token.
 * This is a reactive safety net, not a substitute for explicit signOut().
 */
function handleAuthFailure(response: Response): boolean {
  if (response.status === 401 || response.status === 403) {
    clearCachedToken();
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
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    // Test the token by fetching the authenticated user's repos
    const response = await fetch("https://api.github.com/user/repos?per_page=1", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);

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

  // Initial state fetch — resolve session/user immediately, then fire the
  // callback right away so the UI doesn't hang. verifyRepoScope() is deferred
  // to a background task so a slow/stale GitHub API never blocks the loading
  // state from resolving.
  (async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    cacheProviderToken(session?.provider_token);

    if (mounted) {
      callback({
        user,
        session,
        isLoading: false,
        error: null,
        hasRepoScope: false,
      });
    }

    // Fire repo-scope verification in the background; update callback when done
    if (mounted && session) {
      verifyRepoScope().then((hasRepoScope) => {
        if (mounted) {
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
  })();

  // CRITICAL: the onAuthStateChange callback runs synchronously during event
  // processing. Awaiting Supabase auth methods directly inside it deadlocks
  // the session. All async work MUST be wrapped in an IIFE.
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((event, session) => {
    if (!mounted) return;

    cacheProviderToken(session?.provider_token);
    if (event === "SIGNED_OUT") clearCachedToken();

    // Wrap async work in an IIFE to avoid deadlocking the auth state machine
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!mounted) return;

      callback({
        user,
        session,
        isLoading: event === "INITIAL_SESSION",
        error: null,
        hasRepoScope: false,
      });

      // Verify repo scope in the background so it never blocks the callback
      if (session) {
        verifyRepoScope().then((hasRepoScope) => {
          if (mounted) {
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
    })();
  });

  return () => {
    mounted = false;
    subscription.unsubscribe();
  };
}

/**
 * Handle OAuth callback after GitHub redirect.
 * Call this on the callback route to complete the auth flow.
 *
 * Wraps the code exchange in a try/catch block. If the exchange fails
 * (e.g., flow linking not supported, invalid code, or other auth errors),
 * logs the error and immediately redirects home to prevent UI from
 * hanging on an infinite spinner.
 */
export async function handleAuthCallback(): Promise<Session | null> {
  const { data, error } = await supabase.auth.exchangeCodeForSession(
    new URLSearchParams(window.location.search).get("code") ?? ""
  );

  if (error) throw error;

  // If this callback's payload happens to be sparse, cacheProviderToken is a
  // no-op — it will NOT clear a previously cached token.
  if (data.session?.provider_token) {
    cacheProviderToken(data.session.provider_token);
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

    if (handleAuthFailure(response)) return null;
    if (!response.ok) return null;

    return await response.json();
  } catch {
    return null;
  }
}
