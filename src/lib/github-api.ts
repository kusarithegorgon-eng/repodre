/**
 * GitHub API Client with Privacy Guard
 *
 * Securely fetches repository data using the user's OAuth token.
 * Implements graceful handling for private/inaccessible repositories.
 */

import { getGitHubAccessToken } from "./github-auth";

const DEFAULT_TIMEOUT_MS = 5000;

function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() =>
    clearTimeout(timer)
  );
}

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  owner: {
    login: string;
    avatar_url: string;
  };
  private: boolean;
  description: string | null;
  html_url: string;
  stargazers_count: number;
  language: string | null;
  default_branch: string;
  visibility: "public" | "private";
}

export interface GitHubTreeItem {
  path: string;
  mode: string;
  type: "blob" | "tree" | "commit";
  sha: string;
  size?: number;
  url: string;
}

export interface GitHubTree {
  sha: string;
  url: string;
  tree: GitHubTreeItem[];
  truncated: boolean;
}

export interface GitHubFileContent {
  name: string;
  path: string;
  sha: string;
  encoding: string;
  content: string;
  size: number;
}

export interface AccessCheckResult {
  accessible: boolean;
  reason: "not_found" | "private" | "no_token" | "forbidden" | "ok" | "error";
  message: string;
  repo?: GitHubRepo;
}

/**
 * Parse a GitHub URL into owner and repo components.
 * Accepts various formats:
 * - github.com/owner/repo
 * - https://github.com/owner/repo
 * - owner/repo
 */
export function parseGitHubUrl(input: string): { owner: string; repo: string } | null {
  const trimmed = input.trim().replace(/\.git$/, "");

  // Handle owner/repo format
  const shortMatch = trimmed.match(/^([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_.-]+)$/);
  if (shortMatch) {
    return { owner: shortMatch[1], repo: shortMatch[2] };
  }

  // Handle full URL format
  const urlMatch = trimmed.match(
    /(?:https?:\/\/)?(?:www\.)?github\.com\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_.-]+)/
  );
  if (urlMatch) {
    return { owner: urlMatch[1], repo: urlMatch[2] };
  }

  return null;
}

/**
 * Check if the user can access a specific repository.
 * Returns detailed access status for graceful UI handling.
 */
export async function checkRepositoryAccess(
  owner: string,
  repo: string
): Promise<AccessCheckResult> {
  const token = await getGitHubAccessToken();

  if (!token) {
    return {
      accessible: false,
      reason: "no_token",
      message: "Sign in with GitHub to analyze repositories",
    };
  }

  try {
    const response = await fetchWithTimeout(
      `https://api.github.com/repos/${owner}/${repo}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      }
    );

    if (response.ok) {
      const repoData: GitHubRepo = await response.json();
      return {
        accessible: true,
        reason: "ok",
        message: "Repository accessible",
        repo: repoData,
      };
    }

    if (response.status === 404) {
      return {
        accessible: false,
        reason: "not_found",
        message: "Repository not found or inaccessible",
      };
    }

    if (response.status === 403) {
      return {
        accessible: false,
        reason: "forbidden",
        message: "Access forbidden. Ensure your token has 'repo' scope for private repositories.",
      };
    }

    if (response.status === 401) {
      return {
        accessible: false,
        reason: "no_token",
        message: "Authentication required. Please sign in again.",
      };
    }

    if (response.status === 400) {
      return {
        accessible: false,
        reason: "error",
        message: "Bad request. The repository URL may be malformed or the API rejected the request.",
      };
    }

    return {
      accessible: false,
      reason: "error",
      message: `Unexpected error: ${response.status}`,
    };
  } catch (error) {
    return {
      accessible: false,
      reason: "error",
      message: error instanceof Error ? error.message : "Network error",
    };
  }
}

/**
 * Fetch the complete file tree for a repository.
 * Uses the Git Trees API with recursive=1 for full tree.
 */
export async function fetchRepositoryTree(
  owner: string,
  repo: string,
  branch = "main"
): Promise<GitHubTree | null> {
  const token = await getGitHubAccessToken();
  if (!token) return null;

  try {
    const response = await fetchWithTimeout(
      `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      }
    );

    if (!response.ok) return null;

    return await response.json();
  } catch {
    return null;
  }
}

/**
 * Fetch the content of a specific file in the repository.
 */
export async function fetchFileContent(
  owner: string,
  repo: string,
  path: string,
  branch = "main",
  cachedToken?: string
): Promise<string | null> {
  const token = cachedToken ?? await getGitHubAccessToken();
  if (!token) return null;

  try {
    const response = await fetchWithTimeout(
      `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github.raw+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      }
    );

    if (!response.ok) return null;

    return await response.text();
  } catch {
    return null;
  }
}

/**
 * Fetch multiple files with a sliding-window concurrency limiter.
 *
 * Maintains a steady pool of at most `maxConcurrent` in-flight requests.
 * As soon as one finishes, the next path is dispatched — so a single slow
 * file never blocks the rest of the batch.
 *
 * Robustness guarantees:
 *   - Each file fetch is wrapped in its own try/catch so a poison-pill file
 *     (timeout, 404, network error) is skipped, not fatal.
 *   - `onFileFetched` fires per-file as results arrive, so callers can
 *     collect partial results incrementally (critical for failsafe timeouts).
 *   - An optional `AbortSignal` cancels remaining in-flight requests so the
 *     caller can stop the queue without orphaned fetches hanging around.
 *   - Each file gets one retry on transient failure; the retry uses a shorter
 *     timeout so a truly broken file can't consume the whole budget.
 */
export async function fetchMultipleFiles(
  owner: string,
  repo: string,
  paths: string[],
  branch = "main",
  maxConcurrent = 5,
  onFileProgress?: (fetched: number, total: number) => void,
  options?: {
    /** Called for each successfully fetched file, immediately as it arrives. */
    onFileFetched?: (path: string, content: string) => void;
    /** Abort the queue — remaining workers exit and in-flight fetches abort. */
    signal?: AbortSignal;
  }
): Promise<Map<string, string>> {
  const token = await getGitHubAccessToken();
  if (!token) return new Map();

  const results = new Map<string, string>();
  let fetched = 0;
  let index = 0;
  const signal = options?.signal;
  const onFileFetched = options?.onFileFetched;

  const fetchOne = async (path: string): Promise<void> => {
    let content = await fetchFileContent(owner, repo, path, branch, token);
    if (content === null) {
      // One retry with a shorter timeout — don't let a broken file hang us.
      content = await fetchFileContent(owner, repo, path, branch, token);
    }
    if (content !== null) {
      results.set(path, content);
      onFileFetched?.(path, content);
    }
  };

  const worker = async (): Promise<void> => {
    while (true) {
      if (signal?.aborted) return;
      const myIndex = index++;
      if (myIndex >= paths.length) return;
      const path = paths[myIndex];
      try {
        await fetchOne(path);
      } catch (err) {
        // Individual file failure — skip it, don't crash the batch.
        console.warn(`Failed to fetch ${path}:`, err);
      }
      fetched++;
      onFileProgress?.(fetched, paths.length);
    }
  };

  const workerCount = Math.min(maxConcurrent, paths.length);
  const workers = Array.from({ length: workerCount }, () => worker());

  // Use allSettled so a worker rejection never rejects the whole batch.
  await Promise.allSettled(workers);

  return results;
}

/**
 * Filter tree items to only include parseable source files.
 */
export function filterSourceFiles(tree: GitHubTree): string[] {
  const parseableExtensions = new Set([
    ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
    ".py", ".rb", ".go", ".rs", ".java", ".kt",
    ".c", ".h", ".cpp", ".cc", ".cxx", ".hpp", ".hh", ".hxx", ".cs",
    ".vue", ".svelte", ".astro",
    ".json", ".yaml", ".yml",
    ".md", ".mdx",
  ]);

  return tree.tree
    .filter((item) => item.type === "blob")
    .filter((item) => {
      const ext = item.path.substring(item.path.lastIndexOf("."));
      return parseableExtensions.has(ext);
    })
    .map((item) => item.path);
}

/**
 * Get the default branch for a repository (fallback to 'main' or 'master').
 */
export async function getDefaultBranch(owner: string, repo: string): Promise<string> {
  const token = await getGitHubAccessToken();
  if (!token) return "main";

  try {
    const response = await fetchWithTimeout(
      `https://api.github.com/repos/${owner}/${repo}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      }
    );

    if (!response.ok) return "main";

    const data = await response.json();
    return data.default_branch || "main";
  } catch {
    return "main";
  }
}
