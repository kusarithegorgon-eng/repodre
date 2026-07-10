/**
 * GitHub Repository Parser - Analysis Engine
 *
 * Core utility for fetching repository file trees from GitHub.
 * Strictly scoped to a single, explicitly-specified repository.
 *
 * Security guarantees:
 *   - Requires a FULL repository URL (github.com/owner/repo).
 *     Bare usernames or partial inputs are rejected.
 *   - API calls are pinned to GET /repos/{owner}/{repo} endpoints only.
 *   - NEVER calls /user/repos or any account-wide listing endpoint.
 *   - Logs the target repository name before fetching so the user can
 *     confirm the scope is correct.
 */

export interface RepositoryFile {
  id: string;
  name: string;
}

export interface ParseResult {
  success: boolean;
  files?: RepositoryFile[];
  error?: string;
}

/**
 * Parse a GitHub repository URL to extract owner and repo name.
 *
 * STRICT MODE: Only accepts full repository URLs in the form:
 *   - https://github.com/owner/repo
 *   - http://github.com/owner/repo
 *   - github.com/owner/repo
 *   - https://github.com/owner/repo.git
 *
 * Rejects bare usernames (e.g., "torvalds") and short "owner/repo" forms
 * that lack the github.com host, to prevent accidental broad access.
 */
function extractOwnerAndRepo(url: string): { owner: string; repo: string } | null {
  const trimmed = url.trim().replace(/\.git$/, "");

  // Require the github.com host in the URL — no bare usernames accepted
  const urlMatch = trimmed.match(
    /^(?:https?:\/\/)?(?:www\.)?github\.com\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_.-]+)\/?$/
  );
  if (urlMatch) {
    return { owner: urlMatch[1], repo: urlMatch[2] };
  }

  return null;
}

/**
 * Validate that a parsed owner/repo pair is safe to fetch.
 * Returns a human-readable reason if the input is rejected.
 */
function validateRepoTarget(owner: string, repo: string): string | null {
  if (!owner || !repo) {
    return "Missing owner or repository name.";
  }
  if (owner.length < 1 || repo.length < 1) {
    return "Owner and repository name must not be empty.";
  }
  // Reject obvious wildcard or glob patterns
  if (owner.includes("*") || repo.includes("*")) {
    return "Wildcard patterns are not allowed. Specify a single repository.";
  }
  return null;
}

/**
 * Get GitHub access token from storage.
 */
async function getAccessToken(): Promise<string | null> {
  const token = localStorage.getItem("github_access_token");
  return token;
}

/**
 * Fetch the default branch for a repository.
 *
 * Endpoint: GET /repos/{owner}/{repo}
 * This is a single-repo metadata call — it does NOT list account repositories.
 */
async function getDefaultBranch(owner: string, repo: string, token: string): Promise<string> {
  try {
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    if (response.ok) {
      const data = await response.json();
      return data.default_branch || "main";
    }

    if (response.status === 401) {
      throw new Error("Invalid GitHub token. Please check your Personal Access Token and try again.");
    }
    if (response.status === 403) {
      throw new Error("Access forbidden. Your token may lack required permissions (needs 'repo' scope for private repos).");
    }
    if (response.status === 404) {
      throw new Error(`Repository '${owner}/${repo}' not found. Check if it exists and you have access.`);
    }
  } catch (error) {
    if (error instanceof Error) throw error;
  }

  return "main";
}

/**
 * Fetch the file tree from GitHub API.
 *
 * Endpoint: GET /repos/{owner}/{repo}/git/trees/{branch}?recursive=1
 * This fetches the tree for ONE specific repository only.
 * It does NOT call /user/repos or any account-wide listing endpoint.
 */
async function fetchFileTree(
  owner: string,
  repo: string,
  branch: string,
  token: string
): Promise<Array<{ path: string; type: string }>> {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
      {
        headers: {
          Authorization: `token ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      }
    );

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error("Invalid GitHub token. Please check your Personal Access Token and try again.");
      }
      if (response.status === 403) {
        throw new Error("Access forbidden. Your token may lack required permissions (needs 'repo' scope for private repos).");
      }
      if (response.status === 404) {
        throw new Error(`Repository '${owner}/${repo}' or branch '${branch}' not found. Check if they exist and you have access.`);
      }
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.tree || [];
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new Error("Failed to fetch file tree. Please check your network connection.");
  }
}

/**
 * Parse a GitHub repository and return the list of files.
 *
 * Strictly scoped to a single repository. The input MUST be a full
 * repository URL (e.g., https://github.com/owner/repo). Bare usernames
 * are rejected.
 *
 * @param repoUrl - Full GitHub repository URL (e.g., https://github.com/owner/repo)
 * @param token - Optional GitHub Personal Access Token for authentication
 * @returns Array of files with id (path) and name (filename)
 */
export async function parseGitHubRepoFiles(repoUrl: string, token?: string): Promise<ParseResult> {
  // Step 1: Extract owner and repository name (strict URL parsing)
  const parsed = extractOwnerAndRepo(repoUrl);
  if (!parsed) {
    console.error("Invalid repository URL:", repoUrl);
    return {
      success: false,
      error:
        "Invalid repository URL. A full GitHub URL is required (e.g., https://github.com/owner/repo). Bare usernames are not accepted.",
    };
  }

  const { owner, repo } = parsed;

  // Step 2: Validate the target before any API call
  const validationError = validateRepoTarget(owner, repo);
  if (validationError) {
    console.error("Repository target validation failed:", validationError);
    return { success: false, error: validationError };
  }

  // SAFETY CHECK: Print the exact target repository so the user can confirm
  // this function is only looking at the one they intended.
  console.log(`%c[Repodre Safety Check] Target repository: ${owner}/${repo}`, "color: #2563eb; font-weight: bold");
  console.log(`[Repodre Safety Check] API endpoint: https://api.github.com/repos/${owner}/${repo}`);
  console.log(`[Repodre Safety Check] Scope: single repository only — no account-wide listing`);

  // Step 3: Get access token - use provided token or fall back to localStorage
  let accessToken = token;
  if (!accessToken) {
    accessToken = await getAccessToken();
  }

  if (!accessToken) {
    console.error("No GitHub access token found");
    return {
      success: false,
      error: "GitHub access token not found. Please enter a Personal Access Token or sign in with GitHub.",
    };
  }

  try {
    // Step 4: Get default branch (single-repo metadata call)
    const branch = await getDefaultBranch(owner, repo, accessToken);
    console.log(`Default branch: ${branch}`);

    // Step 5: Fetch file tree (single-repo tree call)
    const tree = await fetchFileTree(owner, repo, branch, accessToken);
    console.log(`Fetched ${tree.length} items from tree`);

    // Step 6: Filter to keep only files (blob type)
    const files: RepositoryFile[] = tree
      .filter((item) => item.type === "blob")
      .map((item) => ({
        id: item.path,
        name: item.path.split("/").pop() ?? item.path,
      }));

    // Step 7: Log results to console
    console.log("=== Repository File List ===");
    console.log(`Total files: ${files.length}`);
    console.log("\nFiles (first 20):");
    files.slice(0, 20).forEach((file) => {
      console.log(`  ${file.id} (${file.name})`);
    });
    if (files.length > 20) {
      console.log(`  ... and ${files.length - 20} more files`);
    }

    return {
      success: true,
      files,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Error parsing repository:", message);
    return {
      success: false,
      error: message,
    };
  }
}

/**
 * Legacy export name for backward compatibility
 * @deprecated Use parseGitHubRepoFiles instead
 */
export const parseRepository = parseGitHubRepoFiles;
