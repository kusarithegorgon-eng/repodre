/**
 * GitHub API Client with Privacy Guard
 *
 * Securely fetches repository data using the user's OAuth token.
 * Implements graceful handling for private/inaccessible repositories.
 * 
 * All requests are routed through the github-api-proxy Edge Function
 * to bypass browser CORS restrictions.
 */

import { getGitHubAccessToken } from "./github-auth";
import { callGitHubAPI } from "./github-api-proxy";

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
    const result = await callGitHubAPI<GitHubRepo>(
      "GET",
      `/repos/${owner}/${repo}`
    );

    if (result.ok && result.data) {
      return {
        accessible: true,
        reason: "ok",
        message: "Repository accessible",
        repo: result.data,
      };
    }

    if (result.status === 404) {
      return {
        accessible: false,
        reason: "not_found",
        message: "Repository not found or inaccessible",
      };
    }

    if (result.status === 403) {
      return {
        accessible: false,
        reason: "forbidden",
        message: "Access forbidden. Ensure your token has 'repo' scope for private repositories.",
      };
    }

    if (result.status === 401) {
      return {
        accessible: false,
        reason: "no_token",
        message: "Authentication required. Please sign in again.",
      };
    }

    return {
      accessible: false,
      reason: "error",
      message: `Error: ${result.error || `HTTP ${result.status}`}`,
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
    const result = await callGitHubAPI<GitHubTree>(
      "GET",
      `/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`
    );

    if (!result.ok) return null;
    return result.data || null;
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
  branch = "main"
): Promise<string | null> {
  const token = await getGitHubAccessToken();
  if (!token) return null;

  try {
    const result = await callGitHubAPI<GitHubFileContent>(
      "GET",
      `/repos/${owner}/${repo}/contents/${path}?ref=${branch}`
    );

    if (!result.ok || !result.data) return null;

    // Decode base64 content
    if (result.data.encoding === "base64" && result.data.content) {
      return atob(result.data.content);
    }

    return result.data.content || null;
  } catch {
    return null;
  }
}

/**
 * Fetch multiple files concurrently.
 */
export async function fetchMultipleFiles(
  owner: string,
  repo: string,
  paths: string[],
  branch = "main",
  maxConcurrent = 10
): Promise<Map<string, string>> {
  const results = new Map<string, string>();

  // Process in batches to avoid rate limiting
  const batches = [];
  for (let i = 0; i < paths.length; i += maxConcurrent) {
    batches.push(paths.slice(i, i + maxConcurrent));
  }

  for (const batch of batches) {
    const promises = batch.map(async (path) => {
      const content = await fetchFileContent(owner, repo, path, branch);
      if (content !== null) {
        results.set(path, content);
      }
    });

    await Promise.all(promises);
  }

  return results;
}

/**
 * Filter tree items to only include parseable source files.
 */
export function filterSourceFiles(tree: GitHubTree): string[] {
  const parseableExtensions = new Set([
    ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
    ".py", ".rb", ".go", ".rs", ".java", ".kt",
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
    const result = await callGitHubAPI<GitHubRepo>(
      "GET",
      `/repos/${owner}/${repo}`
    );

    if (!result.ok || !result.data) return "main";
    return result.data.default_branch || "main";
  } catch {
    return "main";
  }
}
