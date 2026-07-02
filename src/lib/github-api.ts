/**
 * GitHub API Client with Privacy Guard
 *
 * Securely fetches repository data using the user's OAuth token.
 * Implements graceful handling for private/inaccessible repositories.
 */

import { getGitHubAccessToken } from "./github-auth";

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
  // This line cleans up the input immediately!
  const trimmed = input.trim().replace(/\.git$/i, "");
  
  const shortMatch = trimmed.match(/^([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_.-]+)$/);
  if (shortMatch) {
    return { owner: shortMatch[1], repo: shortMatch[2] };
  }
  
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
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

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
 *
 * `branch` is required (no "main" default) so callers can't accidentally
 * fetch against a branch that doesn't exist. Resolve the real default branch
 * first via getDefaultBranch() (or reuse repo.default_branch from
 * checkRepositoryAccess) and pass it in explicitly.
 */
export async function fetchRepositoryTree(
  owner: string,
  repo: string,
  branch: string
): Promise<GitHubTree | null> {
  const token = await getGitHubAccessToken();
  if (!token) return null;

  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    }
  );

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(
        `Branch "${branch}" was not found on ${owner}/${repo}. The default branch may have changed.`
      );
    }
    throw new Error(`Failed to fetch tree for ${owner}/${repo}@${branch} (HTTP ${response.status}).`);
  }

  return await response.json();
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
    const response = await fetch(
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
    ".vue", ".svelte", ". astro",
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
 * Get the true default branch for a repository from the GitHub repo metadata API.
 *
 * Important: this does NOT silently fall back to "main" on failure. A repo's
 * default branch can be "master", "develop", "trunk", etc, so guessing "main"
 * on error just trades a clear failure for a confusing 404 downstream. Callers
 * must handle the thrown error (e.g. surface it as a real access/error state).
 */
export async function getDefaultBranch(owner: string, repo: string): Promise<string> {
  const token = await getGitHubAccessToken();
  if (!token) {
    throw new Error("No GitHub access token available to resolve the default branch.");
  }

  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch repository metadata for ${owner}/${repo} (HTTP ${response.status}). ` +
        `Could not determine the default branch.`
    );
  }

  const data = await response.json();
  if (!data.default_branch) {
    throw new Error(
      `Repository metadata for ${owner}/${repo} did not include a default_branch field.`
    );
  }

  return data.default_branch as string;
}