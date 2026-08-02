export interface RepoNode {
  path: string;
  type: "blob" | "tree";
  sha: string;
  size?: number;
}

export interface ParsedRepo {
  owner: string;
  repo: string;
  branch?: string;
}

const API = "https://api.github.com";

export function parseRepoUrl(input: string): ParsedRepo | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const patterns: RegExp[] = [
    /github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?(?:[/?].*)?$/,
    /^([^/\s]+)\/([^/\s]+)$/,
  ];

  for (const p of patterns) {
    const m = trimmed.match(p);
    if (m) {
      const owner = m[1];
      let repo = m[2];
      if (repo.endsWith(".git")) repo = repo.slice(0, -4);
      const branchMatch = trimmed.match(/(?:tree|branch|releases\/tag)\/([^/?#]+)/);
      return { owner, repo, branch: branchMatch?.[1] };
    }
  }
  return null;
}

async function getDefaultBranch(owner: string, repo: string): Promise<string> {
  const res = await fetch(`${API}/repos/${owner}/${repo}`, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!res.ok) {
    if (res.status === 404) throw new Error(`Repository "${owner}/${repo}" not found.`);
    if (res.status === 403) throw new Error("GitHub API rate limit reached. Try again in a few minutes.");
    throw new Error(`Failed to fetch repo info (HTTP ${res.status}).`);
  }
  const data = await res.json();
  return data.default_branch as string;
}

export async function fetchRepoTree(
  owner: string,
  repo: string,
  branch: string
): Promise<RepoNode[]> {
  const res = await fetch(
    `${API}/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
    { headers: { Accept: "application/vnd.github+json" } }
  );
  if (!res.ok) {
    if (res.status === 403) throw new Error("GitHub API rate limit reached. Try again in a few minutes.");
    throw new Error(`Failed to fetch file tree (HTTP ${res.status}).`);
  }
  const data = await res.json();
  const tree: RepoNode[] = (data.tree as any[]).map((n) => ({
    path: n.path,
    type: n.type === "tree" ? "tree" : "blob",
    sha: n.sha,
    size: n.size,
  }));
  return tree;
}

export async function resolveRepo(parsed: ParsedRepo): Promise<{
  owner: string;
  repo: string;
  branch: string;
}> {
  const branch = parsed.branch || (await getDefaultBranch(parsed.owner, parsed.repo));
  return { owner: parsed.owner, repo: parsed.repo, branch };
}

export function formatBytes(bytes?: number): string {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
