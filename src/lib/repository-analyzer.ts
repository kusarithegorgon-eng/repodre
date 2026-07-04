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
import { layoutBlueprint, layoutEnhancedBlueprint, layoutSectionedBlueprint, filterPortalEdges, type LaidOutBlueprint, type SectionedLayout } from "./system-blueprint";
import { crawlRepository, type FlowchartGraph, type CrawlerNode, type CrawlerEdge } from "./repo-crawler";
import { buildArchGraph, type ArchGraph, type ArchCategory } from "./architecture-decision-engine";
import { buildJourneyGraph, layoutJourneyTree, type JourneyGraph } from "./journey-flow-builder";
import type { AccessCheckResult } from "./github-api";
import type { HandleSegment, Shape } from "./canvas-geometry";
import type { RoleGateway, PortalLink, CanvasSection } from "./domain-sectioning";

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
 * - Domain sectioning with role gateways and portal links
 */
export interface AnalysisGraph {
  nodes: AnalysisGraphNode[];
  edges: AnalysisGraphEdge[];
  blueprint: EnhancedBlueprint;
  layout: LaidOutBlueprint;
  /** Domain sections for visual grouping */
  sections: CanvasSection[];
  /** Role gateway switches for post-login routing */
  roleGateways: RoleGateway[];
  /** Portal links for cross-section navigation */
  portalLinks: PortalLink[];
  /** zero-knowledge crawler graph (routes, interactions, validations) */
  crawlerGraph?: FlowchartGraph;
  /** Architecture Decision Engine graph (UI/DB/LOGIC categorization) */
  archGraph?: ArchGraph;
  /** User-journey flowchart (Start → Landing → Auth → ... → Logout → loop) */
  journeyGraph?: JourneyGraph;
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
  /** Non-null when the source file failed to parse — renders a "Structure Parsing Blocked" card */
  parseError?: string | null;
}

export interface AnalysisGraphEdge {
  id: string;
  from: string;
  to: string;
  fromHandle?: HandleSegment;
  toHandle?: HandleSegment;
  /** Semantic label from the blueprint ("Success", "Failure", etc.) used for YES/NO annotations */
  label?: string;
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
  const parseErrors = new Map<string, string>();
  let processed = 0;

  for (const [path, content] of files) {
    try {
      const mod = parseModule(content, path);
      modules.push(mod);
      if (mod.error) parseErrors.set(path, mod.error);
    } catch (error) {
      console.warn(`Failed to parse ${path}:`, error);
      parseErrors.set(path, error instanceof Error ? error.message : "Parse error");
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

  // ── Blueprint layout (computed once; used by the fallback path) ──────
  const baseLayout = layoutEnhancedBlueprint(blueprint);
  const sectionedLayout = layoutSectionedBlueprint({
    nodes: blueprint.nodes,
    edges: blueprint.edges,
    sections: blueprint.sections,
    roleGateways: blueprint.roleGateways,
    portalLinks: blueprint.portalLinks,
    edgesToPortals: blueprint.edgesToPortals,
  }, baseLayout);

  // ── Journey Flow Builder: primary layout ──────────────────────────────
  // Constructs a continuous user-journey flowchart:
  //   Start → Landing → Auth → Validation → Decisions → Actions → DB → Logout → loop
  // Every node is connected — no dead-ends, no orphans.
  const journeyGraph = buildJourneyGraph(modules);

  // ── Architecture Decision Engine (enrichment / fallback) ──────────────
  const archGraph = buildArchGraph(modules);

  // ── Zero-knowledge local crawler (last-resort fallback) ──────────────
  const crawlerGraph = crawlRepository(filePaths, fileContents);

  onProgress?.({
    phase: "building",
    message: "Laying out user-journey flowchart...",
    percent: 92,
  });

  // ── Layout: journey graph is primary; arch/blueprint/crawler fallback ──
  // Use a hierarchical tree layout so decision nodes branch their children
  // horizontally (family-tree look) instead of stacking everything in a
  // single vertical column.
  const treePositions = layoutJourneyTree(journeyGraph, {
    nodeSep: 240,
    rankSep: 180,
    startX: 120,
    startY: 100,
  });

  let graphNodes: AnalysisGraph["nodes"];
  let graphEdges: AnalysisGraph["edges"];

  if (journeyGraph.nodes.length > 1) {
    // Primary path: user-journey flowchart with tree layout
    graphNodes = journeyGraph.nodes.map((n) => {
      const pos = treePositions.get(n.id);
      return {
        id: n.id,
        label: n.label,
        sub: n.sub,
        shape: n.shape,
        accent: n.accent,
        x: pos?.x ?? 120,
        y: pos?.y ?? 100,
      };
    });

    graphEdges = journeyGraph.edges.map((e) => ({
      id: e.id,
      from: e.from,
      to: e.to,
    }));
  } else if (archGraph.nodes.length > 0) {
    // Fallback 1: Architecture Decision Engine (UI/DB/LOGIC columns)
    const archColWidth = 300;
    const archRowHeight = 140;
    const archStartX = 120;
    const archStartY = 100;

    const categoryOrder: ArchCategory[] = ["UI_NODE", "LOGIC_NODE", "DB_NODE"];
    const colByCategory = new Map<ArchCategory, number>();
    categoryOrder.forEach((cat, i) => colByCategory.set(cat, i));

    const rowByCategory = new Map<ArchCategory, number>();

    graphNodes = archGraph.nodes.map((n) => {
      const col = colByCategory.get(n.category) ?? 0;
      const row = rowByCategory.get(n.category) ?? 0;
      rowByCategory.set(n.category, row + 1);
      return {
        id: n.id,
        label: n.label,
        sub: n.sub,
        shape: n.shape,
        accent: n.accent,
        x: archStartX + col * archColWidth,
        y: archStartY + row * archRowHeight,
      };
    });

    graphEdges = archGraph.edges.map((e) => ({
      id: e.id,
      from: e.from,
      to: e.to,
    }));
  } else {
    // Fallback 2: blueprint layout or zero-knowledge crawler
    const filteredEdges = filterPortalEdges(sectionedLayout.edges, sectionedLayout.edgesToReplace);

    const useCrawlerFallback = sectionedLayout.nodes.length === 0 && crawlerGraph.nodes.length > 0;

    if (useCrawlerFallback) {
      const COL_W = 320;
      const ROW_H = 160;
      const X0 = 80;
      const Y0 = 80;
      const colOf = (type: string) => type === "page" ? 0 : type === "validation" ? 1 : 2;
      const rowCounts = [0, 0, 0];

      graphNodes = crawlerGraph.nodes.map((n) => {
        const col = colOf(n.type);
        const row = rowCounts[col]++;
        return {
          id: n.id,
          label: n.label,
          sub: n.sub,
          shape: n.shape,
          accent: n.accent as AnalysisGraph["nodes"][number]["accent"],
          x: X0 + col * COL_W,
          y: Y0 + row * ROW_H,
        };
      });

      graphEdges = crawlerGraph.edges.map((e) => ({
        id: e.id,
        from: e.from,
        to: e.to,
        renderOpacity: e.inferred ? 0.4 : 1,
        strokeDasharray: e.inferred ? "4 4" : undefined,
      }));
    } else {
      graphNodes = sectionedLayout.nodes.map((n) => ({
        id: n.id,
        label: n.label,
        sub: n.sub,
        shape: n.shape,
        accent: n.accent,
        x: n.x,
        y: n.y,
        styleHints: n.styleHints,
        hasFuzzyReferences: n.hasFuzzyReferences,
      }));

      graphEdges = filteredEdges.map((e) => ({
        id: e.id,
        from: e.from,
        to: e.to,
        fromHandle: e.fromHandle,
        toHandle: e.toHandle,
        label: e.label,
        isRouteReference: e.isRouteReference,
        referenceType: e.referenceType,
        renderOpacity: e.renderOpacity,
        strokeDasharray: e.strokeDasharray,
      }));
    }
  }

  const graph: AnalysisGraph = {
    nodes: graphNodes,
    edges: graphEdges,
    blueprint,
    layout: sectionedLayout,
    sections: sectionedLayout.sections,
    roleGateways: sectionedLayout.roleGateways,
    portalLinks: sectionedLayout.portalLinks,
    archGraph,
    journeyGraph,
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
