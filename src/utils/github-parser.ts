/**
 * GitHub Repository Parser - Analysis Engine
 *
 * Core utility for fetching repository file trees from GitHub.
 * Extracts file structure for visualization and analysis.
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
 */
function extractOwnerAndRepo(url: string): { owner: string; repo: string } | null {
  const trimmed = url.trim().replace(/\.git$/, "");

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
 * Get GitHub access token from storage.
 */
async function getAccessToken(): Promise<string | null> {
  // Check localStorage for stored token
  const token = localStorage.getItem("github_access_token");
  return token;
}

/**
 * Fetch the default branch for a repository.
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

    // Handle authentication errors
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
    // Fall through to default for network errors
  }

  return "main";
}

/**
 * Fetch the file tree from GitHub API.
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
 * @param repoUrl - GitHub repository URL (e.g., https://github.com/owner/repo)
 * @param token - Optional GitHub Personal Access Token for authentication
 * @returns Array of files with id (path) and name (filename)
 */
export async function parseRepository(repoUrl: string, token?: string): Promise<ParseResult> {
  // Step 1: Extract owner and repository name
  const parsed = extractOwnerAndRepo(repoUrl);
  if (!parsed) {
    console.error("Invalid repository URL:", repoUrl);
    return {
      success: false,
      error: "Invalid repository URL. Expected format: owner/repo or https://github.com/owner/repo",
    };
  }

  const { owner, repo } = parsed;
  console.log(`Parsing repository: ${owner}/${repo}`);

  // Step 2: Get access token - use provided token or fall back to localStorage
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
    // Step 3: Get default branch
    const branch = await getDefaultBranch(owner, repo, accessToken);
    console.log(`Default branch: ${branch}`);

    // Step 4: Fetch file tree
    const tree = await fetchFileTree(owner, repo, branch, accessToken);
    console.log(`Fetched ${tree.length} items from tree`);

    // Step 5: Filter to keep only files (blob type)
    const files: RepositoryFile[] = tree
      .filter((item) => item.type === "blob")
      .map((item) => ({
        id: item.path,
        name: item.path.split("/").pop() ?? item.path,
      }));

    // Step 6: Log results to console
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
