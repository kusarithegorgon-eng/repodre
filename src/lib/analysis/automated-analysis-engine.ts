/**
 * Automated Analysis Engine
 *
 * Orchestrates the complete GitHub → AST → Graph pipeline:
 * 1. Fetch repository contents via GitHub API
 * 2. Parse source files through the universal parser
 * 3. Analyze AST to extract dependencies, routes, and relationships
 * 4. Map results to the Node/Edge schema for canvas rendering
 */

import { parseSource, type ParsedModule, type SourceLanguage } from "../parsers";
import type { AccessCheckResult } from "../github-api";
import {
  parseGitHubUrl,
  checkRepositoryAccess,
  fetchRepositoryTree,
  fetchMultipleFiles,
  filterSourceFiles,
  getDefaultBranch,
  type GitHubRepo,
} from "../github-api";
import type { BlueprintNode, BlueprintEdge, BlueprintAccent } from "../blueprint-analyzer";

export interface AnalysisNode {
  id: string;
  label: string;
  sub: string;
  type: NodeType;
  shape: NodeShape;
  accent: BlueprintAccent;
  x: number;
  y: number;
  sourcePath?: string;
  line?: number;
  metadata?: Record<string, unknown>;
}

export type NodeType = "file" | "function" | "class" | "import" | "route" | "component" | "api" | "database";
export type NodeShape = "rectangle" | "pill" | "diamond" | "cylinder" | "hexagon";

export interface AnalysisEdge {
  id: string;
  from: string;
  to: string;
  label?: string;
  kind: EdgeKind;
}

export type EdgeKind = "import" | "call" | "inherit" | "route" | "api" | "reference";

export interface AnalysisGraph {
  nodes: AnalysisNode[];
  edges: AnalysisEdge[];
  metadata: AnalysisMetadata;
}

export interface AnalysisMetadata {
  repo: GitHubRepo;
  branch: string;
  filesParsed: number;
  totalFiles: number;
  languageStats: Map<SourceLanguage, number>;
  duration: number;
  errors: string[];
}

export interface AnalysisResult {
  success: boolean;
  graph?: AnalysisGraph;
  repo?: GitHubRepo;
  error?: string;
  accessIssue?: AccessCheckResult;
}

export interface AnalysisOptions {
  branch?: string;
  maxFiles?: number;
  includePatterns?: RegExp[];
  excludePatterns?: RegExp[];
}

export type ProgressCallback = (phase: AnalysisPhase, message: string, percent: number) => void;

export type AnalysisPhase = "connecting" | "fetching" | "parsing" | "analyzing" | "building" | "complete" | "error";

let nodeIdCounter = 0;
let edgeIdCounter = 0;

function nextNodeId(): string {
  return `node_${++nodeIdCounter}`;
}

function nextEdgeId(): string {
  return `edge_${++edgeIdCounter}`;
}

function resetCounters() {
  nodeIdCounter = 0;
  edgeIdCounter = 0;
}

/**
 * Automated Analysis Engine - Orchestrates GitHub → AST → Graph pipeline.
 */
export class AutomatedAnalysisEngine {
  /**
   * Analyze a GitHub repository and generate a dependency graph.
   */
  async analyze(
    repositoryUrl: string,
    onProgress?: ProgressCallback,
    options: AnalysisOptions = {}
  ): Promise<AnalysisResult> {
    const startTime = Date.now();
    resetCounters();

    const { branch: explicitBranch, maxFiles = 100 } = options;

    // Phase: Connecting
    onProgress?.("connecting", "Parsing repository URL...", 5);

    const parsed = parseGitHubUrl(repositoryUrl);
    if (!parsed) {
      return {
        success: false,
        error: "Invalid repository URL. Expected format: owner/repo or github.com/owner/repo",
      };
    }

    const { owner, repo } = parsed;

    onProgress?.("connecting", `Checking access to ${owner}/${repo}...`, 10);

    const accessCheck = await checkRepositoryAccess(owner, repo);
    if (!accessCheck.accessible) {
      return {
        success: false,
        accessIssue: accessCheck,
        error: accessCheck.message,
      };
    }

    // Phase: Fetching
    onProgress?.("fetching", "Fetching repository structure...", 20);

    const branch = explicitBranch ?? await getDefaultBranch(owner, repo);
    const tree = await fetchRepositoryTree(owner, repo, branch);

    if (!tree) {
      return {
        success: false,
        error: "Failed to fetch repository tree. The repository may be empty.",
      };
    }

    const sourceFiles = filterSourceFiles(tree);
    const filesToFetch = sourceFiles.slice(0, maxFiles);

    if (filesToFetch.length === 0) {
      return {
        success: false,
        error: "No parseable source files found in the repository.",
      };
    }

    onProgress?.("fetching", `Fetching ${filesToFetch.length} files...`, 30);

    const files = await fetchMultipleFiles(owner, repo, filesToFetch, branch, 5);

    // Phase: Parsing
    onProgress?.("parsing", "Parsing source files...", 40);

    const modules: ParsedModule[] = [];
    const errors: string[] = [];
    let processed = 0;

    for (const [path, content] of files) {
      try {
        const mod = parseSource(content, path);
        modules.push(mod);
        if (mod.errors.length > 0) {
          errors.push(...mod.errors.map((e) => `${path}:${e.message}`));
        }
      } catch (err) {
        errors.push(`${path}: ${err instanceof Error ? err.message : "Parse error"}`);
      }

      processed++;
      onProgress?.("parsing", `Parsed ${processed}/${files.size} files`, 40 + (processed / files.size) * 30);
    }

    // Phase: Analyzing
    onProgress?.("analyzing", "Building dependency graph...", 70);

    const graph = this.buildGraph(modules, accessCheck.repo!, branch, startTime, errors);

    // Phase: Complete
    onProgress?.("complete", `Analyzed ${graph.nodes.length} nodes, ${graph.edges.length} edges`, 100);

    return {
      success: true,
      graph,
      repo: accessCheck.repo,
    };
  }

  /**
   * Build the analysis graph from parsed modules.
   */
  private buildGraph(
    modules: ParsedModule[],
    repo: GitHubRepo,
    branch: string,
    startTime: number,
    errors: string[]
  ): AnalysisGraph {
    const nodes: AnalysisNode[] = [];
    const edges: AnalysisEdge[] = [];
    const metadata: AnalysisMetadata = {
      repo,
      branch,
      filesParsed: modules.length,
      totalFiles: modules.length,
      languageStats: new Map(),
      duration: Date.now() - startTime,
      errors,
    };

    const pathToId = new Map<string, string>();
    const symbolToId = new Map<string, string>();

    // Count language stats
    for (const mod of modules) {
      metadata.languageStats.set(
        mod.language,
        (metadata.languageStats.get(mod.language) ?? 0) + 1
      );
    }

    // First pass: Create file nodes
    for (const mod of modules) {
      const fileId = nextNodeId();
      pathToId.set(mod.path, fileId);

      nodes.push({
        id: fileId,
        label: mod.path.split("/").pop() ?? mod.path,
        sub: mod.language,
        type: "file",
        shape: "rectangle",
        accent: "blue",
        x: 0,
        y: 0,
        sourcePath: mod.path,
        metadata: { symbols: mod.symbols },
      });

      // Create function nodes
      for (const func of mod.symbols.functions) {
        const funcId = nextNodeId();
        const key = `${mod.path}::${func.name}`;
        symbolToId.set(key, funcId);

        nodes.push({
          id: funcId,
          label: func.name,
          sub: func.async ? "async" : "sync",
          type: "function",
          shape: "pill",
          accent: "green",
          x: 0,
          y: 0,
          sourcePath: mod.path,
          metadata: { exported: func.exported },
        });

        edges.push({
          id: nextEdgeId(),
          from: fileId,
          to: funcId,
          kind: "reference",
        });
      }

      // Create class nodes
      for (const cls of mod.symbols.classes) {
        const classId = nextNodeId();
        const key = `${mod.path}::${cls.name}`;
        symbolToId.set(key, classId);

        nodes.push({
          id: classId,
          label: cls.name,
          sub: "class",
          type: "class",
          shape: "hexagon",
          accent: "teal",
          x: 0,
          y: 0,
          sourcePath: mod.path,
          metadata: { exported: cls.exported },
        });

        edges.push({
          id: nextEdgeId(),
          from: fileId,
          to: classId,
          kind: "reference",
        });
      }

      // Create component nodes (React)
      for (const comp of mod.symbols.components) {
        const compId = nextNodeId();
        const key = `${mod.path}::${comp.name}`;
        symbolToId.set(key, compId);

        nodes.push({
          id: compId,
          label: comp.name,
          sub: "component",
          type: "component",
          shape: "rectangle",
          accent: "purple",
          x: 0,
          y: 0,
          sourcePath: mod.path,
        });

        edges.push({
          id: nextEdgeId(),
          from: fileId,
          to: compId,
          kind: "reference",
        });
      }
    }

    // Second pass: Create import edges
    for (const mod of modules) {
      const fileId = pathToId.get(mod.path);
      if (!fileId) continue;

      for (const imp of mod.symbols.imports) {
        const importId = nextNodeId();
        nodes.push({
          id: importId,
          label: imp.specifier,
          sub: "import",
          type: "import",
          shape: "pill",
          accent: "orange",
          x: 0,
          y: 0,
          sourcePath: mod.path,
        });

        edges.push({
          id: nextEdgeId(),
          from: fileId,
          to: importId,
          kind: "import",
          label: imp.isDefault ? "default" : imp.isNamespace ? "* as" : undefined,
        });

        // Try to resolve the import to another file
        const resolved = this.resolveImport(imp.specifier, modules);
        if (resolved) {
          const targetId = pathToId.get(resolved);
          if (targetId && targetId !== fileId) {
            edges.push({
              id: nextEdgeId(),
              from: importId,
              to: targetId,
              kind: "reference",
              label: "imports",
            });
          }
        }
      }
    }

    // Third pass: Detect routes and API endpoints
    for (const mod of modules) {
      const routes = this.detectRoutes(mod);
      for (const route of routes) {
        const routeId = nextNodeId();
        nodes.push({
          id: routeId,
          label: route.path,
          sub: route.method,
          type: "route",
          shape: "pill",
          accent: "green",
          x: 0,
          y: 0,
          sourcePath: mod.path,
          metadata: { handler: route.handler },
        });

        const fileId = pathToId.get(mod.path);
        if (fileId) {
          edges.push({
            id: nextEdgeId(),
            from: routeId,
            to: fileId,
            kind: "route",
          });
        }
      }

      const apis = this.detectApis(mod);
      for (const api of apis) {
        const apiId = nextNodeId();
        nodes.push({
          id: apiId,
          label: api.endpoint,
          sub: api.method,
          type: "api",
          shape: "rectangle",
          accent: "teal",
          x: 0,
          y: 0,
          sourcePath: mod.path,
        });

        const fileId = pathToId.get(mod.path);
        if (fileId) {
          edges.push({
            id: nextEdgeId(),
            from: fileId,
            to: apiId,
            kind: "api",
          });
        }
      }
    }

    return { nodes, edges, metadata };
  }

  private resolveImport(specifier: string, modules: ParsedModule[]): string | null {
    // Skip bare modules
    if (!specifier.startsWith(".") && !specifier.startsWith("@/")) return null;

    // Try exact match
    for (const mod of modules) {
      if (mod.path.includes(specifier.replace("./", "").replace("@/", ""))) {
        return mod.path;
      }
    }

    // Try with extensions
    for (const ext of [".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.tsx"]) {
      for (const mod of modules) {
        if (mod.path === specifier + ext || mod.path.endsWith(specifier + ext)) {
          return mod.path;
        }
      }
    }

    return null;
  }

  private detectRoutes(mod: ParsedModule): { path: string; method: string; handler: string }[] {
    const routes: { path: string; method: string; handler: string }[] = [];

    // Next.js App Router: find page.tsx or route.ts references
    if (mod.path.includes("/app/") && mod.path.includes("page.")) {
      const match = mod.path.match(/\/app\/(.+)\/page\./);
      if (match) {
        routes.push({
          path: "/" + match[1],
          method: "GET",
          handler: "page",
        });
      }
    }

    // API routes
    if (mod.path.includes("/api/") || mod.path.includes("route.ts")) {
      const match = mod.path.match(/\/api\/(.+)\/route\./);
      if (match) {
        routes.push({
          path: "/api/" + match[1],
          method: "API",
          handler: "route",
        });
      }
    }

    return routes;
  }

  private detectApis(mod: ParsedModule): { endpoint: string; method: string }[] {
    const apis: { endpoint: string; method: string }[] = [];
    const source = mod.source;

    // Fetch calls
    const fetchRe = /fetch\s*\(\s*['"`]([^'"`]+)['"`]/g;
    let m: RegExpExecArray | null;
    while ((m = fetchRe.exec(source)) !== null) {
      apis.push({ endpoint: m[1], method: "fetch" });
    }

    // Axios calls
    const axiosRe = /axios\.\s*(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]/g;
    while ((m = axiosRe.exec(source)) !== null) {
      apis.push({ endpoint: m[2], method: m[1].toUpperCase() });
    }

    return apis;
  }
}

/**
 * Singleton instance for convenience.
 */
export const automatedAnalysisEngine = new AutomatedAnalysisEngine();
