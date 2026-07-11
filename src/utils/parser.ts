/**
 * Repository Parser Utility
 *
 * Fetches repository file tree from GitHub API and extracts
 * nodes (files) and edges (import relationships) for visualization.
 *
 * Output matches Supabase table schema for nodes and edges.
 */

import {
  parseGitHubUrl,
  checkRepositoryAccess,
  fetchRepositoryTree,
  fetchMultipleFiles,
  filterSourceFiles,
  getDefaultBranch,
  type GitHubRepo,
} from "../lib/github-api";

// ─── Output Types (matching Supabase schema) ───────────────────────────────────

export interface ParsedNode {
  /** Unique ID (file path) */
  id: string;
  /** Display label (filename) */
  label: string;
  /** Secondary text (file type/extension) */
  sub: string;
  /** Node shape for canvas */
  shape: "rectangle" | "pill" | "diamond" | "cylinder" | "hexagon";
  /** Color accent */
  accent: "green" | "purple" | "teal" | "blue" | "orange" | "red";
  /** X position (placeholder, will be set by layout) */
  x: number;
  /** Y position (placeholder, will be set by layout) */
  y: number;
  /** Workspace type */
  workspace: "app" | "erd";
  /** Source file path for reference */
  sourcePath: string;
  /** Detected language */
  language: string;
  /** Number of imports in this file */
  importCount: number;
  /** Number of exports from this file */
  exportCount: number;
}

export interface ParsedEdge {
  /** Unique edge ID */
  id: string;
  /** Source node ID (file containing the import) */
  from: string;
  /** Target node ID (imported file) */
  to: string;
  /** Import specifier as written in source */
  importSpecifier: string;
  /** Whether the import was resolved to a file in the tree */
  resolved: boolean;
  /** Line number of the import statement */
  line?: number;
}

export interface ParsedRepository {
  /** Repository metadata */
  repo: GitHubRepo;
  /** Branch analyzed */
  branch: string;
  /** All parsed nodes (files) */
  nodes: ParsedNode[];
  /** All parsed edges (imports) */
  edges: ParsedEdge[];
  /** Statistics */
  stats: {
    totalFiles: number;
    parsedFiles: number;
    totalImports: number;
    resolvedImports: number;
    unresolvedImports: number;
    languageBreakdown: Record<string, number>;
  };
}

// ─── Parser Result ────────────────────────────────────────────────────────────

export interface ParserResult {
  success: boolean;
  data?: ParsedRepository;
  error?: string;
}

// ─── Import Extraction ────────────────────────────────────────────────────────

/**
 * Extract import statements from source code using regex.
 * Supports ES6 imports, CommonJS require, and Python imports.
 */
function extractImports(source: string, filePath: string): { specifier: string; line: number }[] {
  const imports: { specifier: string; line: number }[] = [];
  const seen = new Set<string>();
  const lines = source.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // ES6 imports: import X from 'specifier' | import { X } from 'specifier'
    const es6Match = line.match(/import\s+(?:[^'"]+\s+from\s+)?['"`]([^'"`]+)['"`]/);
    if (es6Match) {
      const spec = es6Match[1];
      if (!seen.has(spec) && !isBareModule(spec)) {
        seen.add(spec);
        imports.push({ specifier: spec, line: i + 1 });
      }
      continue;
    }

    // CommonJS: require('specifier')
    const cjsMatch = line.match(/require\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/);
    if (cjsMatch) {
      const spec = cjsMatch[1];
      if (!seen.has(spec) && !isBareModule(spec)) {
        seen.add(spec);
        imports.push({ specifier: spec, line: i + 1 });
      }
      continue;
    }

    // Python: from X import Y | import X
    if (filePath.endsWith(".py")) {
      const pyFromMatch = line.match(/from\s+([\w.]+)\s+import/);
      if (pyFromMatch) {
        const spec = pyFromMatch[1];
        if (!seen.has(spec) && !isBareModule(spec)) {
          seen.add(spec);
          imports.push({ specifier: spec, line: i + 1 });
        }
        continue;
      }

      const pyImportMatch = line.match(/^import\s+([\w.]+)/);
      if (pyImportMatch) {
        const spec = pyImportMatch[1];
        if (!seen.has(spec) && !isBareModule(spec)) {
          seen.add(spec);
          imports.push({ specifier: spec, line: i + 1 });
        }
      }
    }
  }

  return imports;
}

/**
 * Extract export statements from source code.
 */
function extractExports(source: string): { name: string; line: number }[] {
  const exports: { name: string; line: number }[] = [];
  const lines = source.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // export function/name/class
    const exportMatch = line.match(/export\s+(?:async\s+)?(?:function|class|const|let|var)\s+(\w+)/);
    if (exportMatch) {
      exports.push({ name: exportMatch[1], line: i + 1 });
      continue;
    }

    // export { X, Y }
    const exportBlockMatch = line.match(/export\s*\{([^}]+)\}/);
    if (exportBlockMatch) {
      const names = exportBlockMatch[1].split(",").map((n) => n.trim().split(" as ")[0].trim());
      for (const name of names) {
        if (name) exports.push({ name, line: i + 1 });
      }
    }
  }

  return exports;
}

/**
 * Check if an import specifier is a bare module (node_modules).
 */
function isBareModule(specifier: string): boolean {
  // Relative paths are not bare modules
  if (specifier.startsWith(".") || specifier.startsWith("/")) {
    return false;
  }
  // @ prefixed scopes (like @/...) could be aliases
  if (specifier.startsWith("@/")) {
    return false;
  }
  // Everything else is a bare module
  return true;
}

/**
 * Resolve an import specifier to a file path in the tree.
 */
function resolveImport(
  specifier: string,
  importerPath: string,
  filePathSet: Set<string>
): string | null {
  // Handle path aliases
  if (specifier.startsWith("@/")) {
    // Convert @/ to src/
    const candidate = "src/" + specifier.slice(2);
    const resolved = tryExtensions(candidate, filePathSet);
    if (resolved) return resolved;
  }

  // Handle relative paths
  if (specifier.startsWith(".")) {
    const dir = importerPath.includes("/")
      ? importerPath.slice(0, importerPath.lastIndexOf("/"))
      : "";
    const candidate = dir ? `${dir}/${specifier}` : specifier;
    const resolved = tryExtensions(candidate, filePathSet);
    if (resolved) return resolved;
  }

  // Handle absolute paths
  if (specifier.startsWith("/")) {
    const resolved = tryExtensions(specifier.slice(1), filePathSet);
    if (resolved) return resolved;
  }

  return null;
}

/**
 * Try different file extensions to resolve a path.
 */
function tryExtensions(basePath: string, filePathSet: Set<string>): string | null {
  const extensions = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py"];

  // Try exact path
  if (filePathSet.has(basePath)) return basePath;

  // Try with extensions
  for (const ext of extensions) {
    const withExt = basePath + ext;
    if (filePathSet.has(withExt)) return withExt;
  }

  // Try index files
  for (const ext of extensions) {
    const indexFile = `${basePath}/index${ext}`;
    if (filePathSet.has(indexFile)) return indexFile;
  }

  return null;
}

/**
 * Get language from file extension.
 */
function getLanguage(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "ts":
      return "TypeScript";
    case "tsx":
      return "TypeScript (React)";
    case "js":
      return "JavaScript";
    case "jsx":
      return "JavaScript (React)";
    case "py":
      return "Python";
    case "go":
      return "Go";
    case "rs":
      return "Rust";
    case "java":
      return "Java";
    default:
      return ext?.toUpperCase() ?? "Unknown";
  }
}

/**
 * Get shape based on file type.
 */
function getShapeForFile(filePath: string): ParsedNode["shape"] {
  if (filePath.includes("/api/") || filePath.includes("route.")) {
    return "pill";
  }
  if (filePath.includes("/pages/") || filePath.includes("page.")) {
    return "rectangle";
  }
  if (filePath.endsWith(".test.ts") || filePath.endsWith(".spec.ts")) {
    return "diamond";
  }
  if (filePath.includes("/components/")) {
    return "hexagon";
  }
  if (filePath.includes("/lib/") || filePath.includes("/utils/")) {
    return "rectangle";
  }
  return "rectangle";
}

/**
 * Get accent color based on file type.
 */
function getAccentForFile(filePath: string): ParsedNode["accent"] {
  if (filePath.includes("/api/") || filePath.includes("route.")) {
    return "teal";
  }
  if (filePath.includes("/pages/") || filePath.includes("page.")) {
    return "green";
  }
  if (filePath.includes("/components/")) {
    return "purple";
  }
  if (filePath.includes("/lib/") || filePath.includes("/utils/")) {
    return "blue";
  }
  if (filePath.endsWith(".test.ts") || filePath.endsWith(".spec.ts")) {
    return "orange";
  }
  return "blue";
}

// ─── Main Parser Function ──────────────────────────────────────────────────────

/**
 * Parse a GitHub repository and extract nodes and edges.
 *
 * @param repositoryUrl - GitHub URL (owner/repo or full URL)
 * @param onProgress - Optional progress callback
 */
export async function parseRepository(
  repositoryUrl: string,
  onProgress?: (phase: string, message: string, percent: number) => void
): Promise<ParserResult> {
  try {
    // Parse URL
    onProgress?.("connecting", "Parsing repository URL...", 5);
    const parsed = parseGitHubUrl(repositoryUrl);
    if (!parsed) {
      return {
        success: false,
        error: "Invalid repository URL. Expected format: owner/repo or github.com/owner/repo",
      };
    }

    const { owner, repo } = parsed;

    // Check access
    onProgress?.("connecting", `Checking access to ${owner}/${repo}...`, 10);
    const accessCheck = await checkRepositoryAccess(owner, repo);
    if (!accessCheck.accessible) {
      return {
        success: false,
        error: accessCheck.message,
      };
    }

    // Get branch
    onProgress?.("fetching", "Fetching repository structure...", 20);
    const branch = await getDefaultBranch(owner, repo);

    // Fetch tree
    const tree = await fetchRepositoryTree(owner, repo, branch);
    if (!tree) {
      return {
        success: false,
        error: "Failed to fetch repository tree. The repository may be empty.",
      };
    }

    // Filter source files
    const sourceFiles = filterSourceFiles(tree);
    if (sourceFiles.length === 0) {
      return {
        success: false,
        error: "No parseable source files found in the repository.",
      };
    }

    onProgress?.("fetching", `Fetching ${sourceFiles.length} files...`, 30);

    // Fetch file contents
    const files = await fetchMultipleFiles(owner, repo, sourceFiles, branch, 5);

    onProgress?.("parsing", "Parsing files and extracting imports...", 50);

    // Build file path set for resolution
    const filePathSet = new Set(files.keys());

    // Parse nodes and edges
    const nodes: ParsedNode[] = [];
    const edges: ParsedEdge[] = [];
    const languageBreakdown: Record<string, number> = {};
    let edgeCounter = 0;

    let processed = 0;
    const total = files.size;

    for (const [filePath, content] of files) {
      processed++;
      const progress = 50 + (processed / total) * 40;
      onProgress?.("parsing", `Parsing ${filePath}...`, progress);

      // Extract imports and exports
      const imports = extractImports(content, filePath);
      const exports = extractExports(content);
      const language = getLanguage(filePath);

      // Track language stats
      languageBreakdown[language] = (languageBreakdown[language] ?? 0) + 1;

      // Create node
      const node: ParsedNode = {
        id: filePath,
        label: filePath.split("/").pop() ?? filePath,
        sub: language,
        shape: getShapeForFile(filePath),
        accent: getAccentForFile(filePath),
        x: 0,
        y: 0,
        workspace: "app",
        sourcePath: filePath,
        language,
        importCount: imports.length,
        exportCount: exports.length,
      };
      nodes.push(node);

      // Create edges for imports
      for (const imp of imports) {
        const resolvedPath = resolveImport(imp.specifier, filePath, filePathSet);

        edges.push({
          id: `edge_${++edgeCounter}`,
          from: filePath,
          to: resolvedPath ?? imp.specifier,
          importSpecifier: imp.specifier,
          resolved: resolvedPath !== null,
          line: imp.line,
        });
      }
    }

    // Calculate stats
    const stats = {
      totalFiles: sourceFiles.length,
      parsedFiles: files.size,
      totalImports: edges.length,
      resolvedImports: edges.filter((e) => e.resolved).length,
      unresolvedImports: edges.filter((e) => !e.resolved).length,
      languageBreakdown,
    };

    const result: ParsedRepository = {
      repo: accessCheck.repo!,
      branch,
      nodes,
      edges,
      stats,
    };

    onProgress?.("complete", `Parsed ${stats.parsedFiles} files, ${stats.totalImports} imports`, 100);

    // Log to console for verification
    console.log("=== Parsed Repository ===");
    console.log("Repository:", result.repo.full_name);
    console.log("Branch:", result.branch);
    console.log("Nodes:", result.nodes.length);
    console.log("Edges:", result.edges.length);
    console.log("Stats:", result.stats);
    console.log("\n=== Nodes ===");
    for (const node of result.nodes.slice(0, 10)) {
      console.log(`  ${node.id}: ${node.label} (${node.language}) - ${node.importCount} imports, ${node.exportCount} exports`);
    }
    if (result.nodes.length > 10) {
      console.log(`  ... and ${result.nodes.length - 10} more`);
    }
    console.log("\n=== Edges (resolved) ===");
    const resolvedEdges = result.edges.filter((e) => e.resolved).slice(0, 10);
    for (const edge of resolvedEdges) {
      console.log(`  ${edge.from} -> ${edge.to}`);
    }
    if (resolvedEdges.length < result.edges.filter((e) => e.resolved).length) {
      console.log(`  ... and ${result.edges.filter((e) => e.resolved).length - resolvedEdges.length} more`);
    }
    console.log("\n=== Unresolved Imports ===");
    const unresolved = result.edges.filter((e) => !e.resolved).slice(0, 10);
    for (const edge of unresolved) {
      console.log(`  ${edge.from} ->? ${edge.importSpecifier}`);
    }
    if (unresolved.length < result.edges.filter((e) => !e.resolved).length) {
      console.log(`  ... and ${result.edges.filter((e) => !e.resolved).length - unresolved.length} more`);
    }

    return {
      success: true,
      data: result,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error during parsing",
    };
  }
}

/**
 * Quick parse - returns just nodes and edges arrays.
 */
export async function quickParse(
  repositoryUrl: string
): Promise<{ nodes: ParsedNode[]; edges: ParsedEdge[] } | null> {
  const result = await parseRepository(repositoryUrl);
  if (!result.success || !result.data) return null;
  return {
    nodes: result.data.nodes,
    edges: result.data.edges,
  };
}
