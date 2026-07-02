/**
 * Repository Analysis Engine
 *
 * Orchestrates the complete app-mapping pipeline:
 * 1. Fetch repository metadata and tree from GitHub
 * 2. Parse source files with the AST parser
 * 3. Run the enhanced blueprint analyzer with:
 *    - Component recursive dependency resolver
 *    - Route parameter normalization engine
 *    - Fuzzy accelerated route matcher
 * 4. Lay out the resulting graph as a left-to-right user-journey timeline
 * 5. Return a complete project structure for visualization
 */

import { parseGitHubUrl, checkRepositoryAccess, fetchRepositoryTree, fetchMultipleFiles, filterSourceFiles, getDefaultBranch, type GitHubRepo } from "./github-api";
import { parseModule } from "./ast-parser";
import { analyzeBlueprintEnhanced, type EnhancedBlueprint } from "./enhanced-analyzer";
import { layoutBlueprint, layoutEnhancedBlueprint, type LaidOutBlueprint } from "./system-blueprint";
import { crawlRepository, type FlowchartGraph, type CrawlerNode, type CrawlerEdge } from "./repo-crawler";
import type { AccessCheckResult } from "./github-api";
import type { HandleSegment, Shape } from "./canvas-geometry";

export interface AnalysisProgress {
  phase: "connecting" | "fetching" | "parsing" | "building" | "complete" | "error";
  message: string;
  percent: number;
  filesProcessed?: number;
  totalFiles?: number;
}

/**
 * The graph returned to the UI. It mirrors the shape consumed by HomePage
 * (nodes with label/sub/shape/accent/x/y, edges with from/to/handles) but
 * is produced by the enhanced blueprint pipeline with:
 * - Component dependency resolution
 * - Dynamic route normalization
 * - Fuzzy route matching with reference edges
 */
export interface AnalysisGraph {
  nodes: AnalysisGraphNode[];
  edges: AnalysisGraphEdge[];
  blueprint: EnhancedBlueprint;
  layout: LaidOutBlueprint;
  /** zero-knowledge crawler graph (routes, interactions, validations) */
  crawlerGraph?: FlowchartGraph;
}

export interface AnalysisGraphNode {
  id: string;
  label: string;
  sub: string;
  shape: Shape;
  accent: "green" | "purple" | "teal" | "blue" | "orange" | "red";
  x: number;
  y: number;
  /** Style hints for dynamic routes (dashed borders) */
  styleHints?: {
    borderStyle: "solid" | "dashed" | "dotted";
    borderDashArray: string;
    opacity: number;
    showParamBadge: boolean;
    paramBadgeText: string;
  };
  /** Whether this node has fuzzy route references */
  hasFuzzyReferences?: boolean;
}

export interface AnalysisGraphEdge {
  id: string;
  from: string;
  to: string;
  fromHandle?: HandleSegment;
  toHandle?: HandleSegment;
  /** Whether this is a route reference edge (fuzzy match) */
  isRouteReference?: boolean;
  /** Detection method for route references */
  referenceType?: "explicit" | "fuzzy" | "inferred";
  /** Opacity for rendering (lower for fuzzy matches) */
  renderOpacity?: number;
  /** SVG stroke-dasharray for edge styling */
  strokeDasharray?: string;
}

export interface AnalysisResult {
  success: boolean;
  repo?: GitHubRepo;
  graph?: AnalysisGraph;
  error?: string;
  accessIssue?: AccessCheckResult;
}

export type ProgressCallback = (progress: AnalysisProgress) => void;

/**
 * Analyze a GitHub repository and generate an execution flow map.
 *
 * @param repositoryUrl - GitHub URL in any format (owner/repo, full URL, etc.)
 * @param onProgress - Optional callback for progress updates
 * @param options - Analysis options (file limits, branch, etc.)
 */
export async function analyzeRepository(
  repositoryUrl: string,
  onProgress?: ProgressCallback,
  options: {
    maxFiles?: number;
    branch?: string;
    includePatterns?: RegExp[];
    excludePatterns?: RegExp[];
  } = {}
): Promise<AnalysisResult> {
  const { maxFiles = 100, branch: explicitBranch } = options;

  // Phase: Connecting
  onProgress?.({
    phase: "connecting",
    message: "Parsing repository URL...",
    percent: 5,
  });

  // Parse the URL
  const parsed = parseGitHubUrl(repositoryUrl);
  if (!parsed) {
    return {
      success: false,
      error: "Invalid repository URL. Expected format: owner/repo or github.com/owner/repo",
    };
  }

  const { owner, repo } = parsed;

  // Check access
  onProgress?.({
    phase: "connecting",
    message: `Checking access to ${owner}/${repo}...`,
    percent: 10,
  });

  const accessCheck = await checkRepositoryAccess(owner, repo);
  if (!accessCheck.accessible) {
    return {
      success: false,
      accessIssue: accessCheck,
      error: accessCheck.message,
    };
  }

  // Phase: Fetching
  onProgress?.({
    phase: "fetching",
    message: "Fetching repository structure...",
    percent: 20,
  });

  // Get default branch
  const branch = explicitBranch || await getDefaultBranch(owner, repo);

  // Fetch the file tree
  const tree = await fetchRepositoryTree(owner, repo, branch);
  if (!tree) {
    return {
      success: false,
      error: "Failed to fetch repository tree. The repository may be empty.",
    };
  }

  // Filter to source files
  const sourceFiles = filterSourceFiles(tree);
  const filesToFetch = sourceFiles.slice(0, maxFiles);

  if (filesToFetch.length === 0) {
    return {
      success: false,
      error: "No parseable source files found in the repository.",
    };
  }

  onProgress?.({
    phase: "fetching",
    message: `Fetching ${filesToFetch.length} files...`,
    percent: 30,
    totalFiles: filesToFetch.length,
  });

  // Fetch file contents
  const files = await fetchMultipleFiles(owner, repo, filesToFetch, branch, 5);

  // Phase: Parsing
  onProgress?.({
    phase: "parsing",
    message: "Parsing source files...",
    percent: 50,
    filesProcessed: 0,
    totalFiles: files.size,
  });

  // Parse each file
  const modules = [];
  let processed = 0;

  for (const [path, content] of files) {
    try {
      const mod = parseModule(content, path);
      modules.push(mod);
    } catch (error) {
      console.warn(`Failed to parse ${path}:`, error);
    }

    processed++;
    onProgress?.({
      phase: "parsing",
      message: `Parsed ${processed}/${files.size} files`,
      percent: 50 + (processed / files.size) * 30,
      filesProcessed: processed,
      totalFiles: files.size,
    });
  }

  // Phase: Building
  onProgress?.({
    phase: "building",
    message: "Detecting routes, validation, and API hooks...",
    percent: 80,
  });

  // ── Build file paths and contents for enhanced analysis ───────────────
  const filePaths = Array.from(files.keys());
  const fileContents = new Map<string, string>();
  for (const [path, content] of files) {
    fileContents.set(path, content);
  }

  // Run the enhanced blueprint analyzer:
  // - Component recursive dependency resolver
  // - Route parameter normalization (dynamic [id]/[slug] routes)
  // - Fuzzy accelerated route matcher
  const blueprint = analyzeBlueprintEnhanced(modules, fileContents, filePaths);

  // ── Zero-knowledge local crawler: scan file tree + raw contents ──────
  // The crawler runs alongside the AST-based blueprint analyzer, providing
  // a lightweight directory-structure-first scan that catches routes and
  // interactions the AST parser might miss.
  const crawlerGraph = crawlRepository(filePaths, fileContents);

  onProgress?.({
    phase: "building",
    message: "Laying out user-journey timeline...",
    percent: 92,
  });

  // Lay out the enhanced blueprint with style hints for dynamic routes
  const layout = layoutEnhancedBlueprint(blueprint);

  const graph: AnalysisGraph = {
    nodes: layout.nodes.map((n) => ({
      id: n.id,
      label: n.label,
      sub: n.sub,
      shape: n.shape,
      accent: n.accent,
      x: n.x,
      y: n.y,
      styleHints: n.styleHints,
      hasFuzzyReferences: n.hasFuzzyReferences,
    })),
    edges: layout.edges.map((e) => ({
      id: e.id,
      from: e.from,
      to: e.to,
      fromHandle: e.fromHandle,
      toHandle: e.toHandle,
      isRouteReference: e.isRouteReference,
      referenceType: e.referenceType,
      renderOpacity: e.renderOpacity,
      strokeDasharray: e.strokeDasharray,
    })),
    blueprint,
    layout,
  };

  // Phase: Complete
  onProgress?.({
    phase: "complete",
    message: `Mapped ${blueprint.stats.routes} routes, ${blueprint.stats.validations} validations, ${blueprint.stats.controllers} controllers, ${blueprint.stats.databases} tables`,
    percent: 100,
    filesProcessed: modules.length,
    totalFiles: files.size,
  });

  return {
    success: true,
    repo: accessCheck.repo,
    graph: { ...graph, crawlerGraph },
  };
}

/**
 * Quick analysis that runs in the background and returns results when done.
 */
export function analyzeRepositoryAsync(
  repositoryUrl: string,
  options?: Parameters<typeof analyzeRepository>[2]
): {
  promise: Promise<AnalysisResult>;
  cancel: () => void;
} {
  let cancelled = false;

  const promise = analyzeRepository(
    repositoryUrl,
    (progress) => {
      if (cancelled) throw new Error("Analysis cancelled");
    },
    options
  );

  return {
    promise,
    cancel: () => {
      cancelled = true;
    },
  };
}

/**
 * Infer a project type from the repository structure.
 */
export function inferProjectType(
  filePaths: string[]
): "nextjs" | "react" | "node" | "python" | "go" | "unknown" {
  const hasApp = filePaths.some((p) => p.includes("app/") && p.includes("route."));
  const hasPages = filePaths.some((p) => p.includes("pages/") && p.endsWith(".tsx"));
  const hasNextConfig = filePaths.some((p) => p.includes("next.config"));

  if (hasApp || hasPages || hasNextConfig) {
    return "nextjs";
  }

  const hasReact = filePaths.some(
    (p) => p.endsWith(".jsx") || p.endsWith(".tsx") || p.includes("react")
  );
  if (hasReact) {
    return "react";
  }

  const hasNode = filePaths.some((p) => p.includes("package.json") || p.includes("express"));
  if (hasNode) {
    return "node";
  }

  const hasPython = filePaths.some((p) => p.endsWith(".py"));
  if (hasPython) {
    return "python";
  }

  const hasGo = filePaths.some((p) => p.endsWith(".go"));
  if (hasGo) {
    return "go";
  }

  return "unknown";
}
