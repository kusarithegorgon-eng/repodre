/**
 * Component Recursive Dependency Resolver
 *
 * Upgrades the file scanner to implement a recursive component import crawler.
 * When parsing any 'page.tsx' file, intercepts the top 'import ... from' code paths
 * and automatically traverses imported sub-components to build consolidated context.
 *
 * This enables deep analysis of component trees for a complete execution flow map.
 */

import type { ParsedModule, ParsedImport } from "./ast-parser";

/**
 * Resolved component with its full dependency chain.
 */
export interface ResolvedComponent {
  /** The primary module path */
  path: string;
  /** The raw source content */
  source: string;
  /** All imports found in this module */
  imports: ParsedImport[];
  /** Recursively resolved dependencies */
  dependencies: ResolvedComponent[];
  /** Consolidated source context (own source + all dependency sources) */
  consolidatedContext: string;
  /** Depth in the dependency tree */
  depth: number;
  /** Whether this is a leaf node (no further imports) */
  isLeaf: boolean;
}

/**
 * Import graph node for cycle detection and traversal.
 */
interface ImportNode {
  path: string;
  resolved: boolean;
  inProgress: boolean;
}

/**
 * Configuration for the resolver.
 */
export interface ResolverConfig {
  /** Maximum recursion depth (default: 5) */
  maxDepth: number;
  /** Include node_modules imports (default: false) */
  includeNodeModules: boolean;
  /** Include relative imports starting with ./ or ../ */
  includeRelative: boolean;
  /** Include path alias imports (@/...) */
  includeAliases: boolean;
  /** Maximum total modules to resolve (safety limit) */
  maxModules: number;
  /** File extensions to resolve */
  extensions: string[];
}

const DEFAULT_CONFIG: ResolverConfig = {
  maxDepth: 5,
  includeNodeModules: false,
  includeRelative: true,
  includeAliases: true,
  maxModules: 100,
  extensions: [".tsx", ".ts", ".jsx", ".js", ".mjs"],
};

/**
 * Normalizes an import path to an absolute file path.
 * Handles relative paths, path aliases, and bare specifiers.
 */
export function normalizeImportPath(
  importPath: string,
  currentFilePath: string,
  allFilePaths: Set<string>
): string | null {
  // Skip node_modules unless configured otherwise
  if (!importPath.startsWith(".") && !importPath.startsWith("@")) {
    return null;
  }

  // Handle path aliases (@/... → src/...)
  if (importPath.startsWith("@/")) {
    const relativePath = importPath.slice(2); // Remove '@'
    // Try each extension
    for (const ext of DEFAULT_CONFIG.extensions) {
      const candidate = `src${relativePath}${ext}`;
      if (allFilePaths.has(candidate)) {
        return candidate;
      }
      // Try index files
      const indexCandidate = `src${relativePath}/index${ext}`;
      if (allFilePaths.has(indexCandidate)) {
        return indexCandidate;
      }
    }
    return null;
  }

  // Handle relative imports (./... or ../...)
  if (importPath.startsWith(".")) {
    const currentDir = currentFilePath.substring(0, currentFilePath.lastIndexOf("/"));
    const resolved = resolveRelativePath(currentDir, importPath);

    // Try each extension
    for (const ext of DEFAULT_CONFIG.extensions) {
      const candidate = resolved + ext;
      if (allFilePaths.has(candidate)) {
        return candidate;
      }
      // Try index files
      const indexCandidate = `${resolved}/index${ext}`;
      if (allFilePaths.has(indexCandidate)) {
        return indexCandidate;
      }
    }
    return null;
  }

  return null;
}

/**
 * Resolves a relative import path against a directory.
 */
function resolveRelativePath(currentDir: string, importPath: string): string {
  const parts = currentDir.split("/");
  const importParts = importPath.split("/");

  for (const part of importParts) {
    if (part === "..") {
      parts.pop();
    } else if (part !== ".") {
      parts.push(part);
    }
  }

  return parts.join("/");
}

/**
 * Resolves all component dependencies recursively.
 *
 * @param rootPath - The starting file path (e.g., 'app/page.tsx')
 * @param fileContents - Map of all available file contents from the repository
 * @param parsedModules - Map of already parsed modules
 * @param config - Resolver configuration
 * @returns The fully resolved component tree with consolidated context
 */
export function resolveComponentDependencies(
  rootPath: string,
  fileContents: Map<string, string>,
  parsedModules: Map<string, ParsedModule>,
  config: Partial<ResolverConfig> = {}
): ResolvedComponent {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  const visited = new Map<string, ImportNode>();
  const allFilePaths = new Set(fileContents.keys());

  let moduleCount = 0;

  function resolve(
    path: string,
    depth: number,
    currentContext: string[]
  ): ResolvedComponent | null {
    // Safety limits
    if (depth > fullConfig.maxDepth || moduleCount >= fullConfig.maxModules) {
      return null;
    }

    // Cycle detection
    const existing = visited.get(path);
    if (existing?.inProgress) {
      // Circular dependency detected - break the cycle
      return null;
    }
    if (existing?.resolved) {
      // Already fully resolved - return a reference
      return null;
    }

    // Mark as in progress
    visited.set(path, { path, resolved: false, inProgress: true });
    moduleCount++;

    // Get the parsed module
    const parsed = parsedModules.get(path);
    if (!parsed) {
      visited.set(path, { path, resolved: true, inProgress: false });
      return null;
    }

    const source = parsed.source;
    const imports = parsed.imports;

    // Add this module's source to the context chain
    const contextWithThis = [...currentContext, source];

    // Recursively resolve each import
    const dependencies: ResolvedComponent[] = [];
    for (const imp of imports) {
      const normalizedPath = normalizeImportPath(imp.source, path, allFilePaths);
      if (!normalizedPath) continue;

      const dep = resolve(normalizedPath, depth + 1, contextWithThis);
      if (dep) {
        dependencies.push(dep);
      }
    }

    // Mark as fully resolved
    visited.set(path, { path, resolved: true, inProgress: false });

    // Build consolidated context: own source + all dependency sources joined
    const depContexts = dependencies.map((d) => d.consolidatedContext);
    const consolidatedContext = [source, ...depContexts].join("\n\n// --- Imported Component ---\n\n");

    return {
      path,
      source,
      imports,
      dependencies,
      consolidatedContext,
      depth,
      isLeaf: dependencies.length === 0,
    };
  }

  const result = resolve(rootPath, 0, []);
  return result ?? {
    path: rootPath,
    source: fileContents.get(rootPath) ?? "",
    imports: [],
    dependencies: [],
    consolidatedContext: fileContents.get(rootPath) ?? "",
    depth: 0,
    isLeaf: true,
  };
}

/**
 * Extracts the component import graph as a flat list of edges.
 * Useful for visualizing the dependency structure.
 */
export function extractImportEdges(
  resolved: ResolvedComponent
): Array<{ from: string; to: string; depth: number }> {
  const edges: Array<{ from: string; to: string; depth: number }> = [];

  function traverse(node: ResolvedComponent) {
    for (const dep of node.dependencies) {
      edges.push({ from: node.path, to: dep.path, depth: node.depth });
      traverse(dep);
    }
  }

  traverse(resolved);
  return edges;
}

/**
 * Creates a combined source string for deep analysis.
 * This enables running interaction extraction over the complete component tree.
 */
export function buildConsolidatedSource(resolved: ResolvedComponent): string {
  const parts: string[] = [];

  function collect(node: ResolvedComponent, seen: Set<string>) {
    if (seen.has(node.path)) return;
    seen.add(node.path);

    parts.push(`// === ${node.path} ===\n${node.source}`);

    for (const dep of node.dependencies) {
      collect(dep, seen);
    }
  }

  collect(resolved, new Set());
  return parts.join("\n\n");
}

/**
 * Detects shared UI components that are used across multiple pages.
 * Returns a map of component path → usage count.
 */
export function detectSharedComponents(
  pagePaths: string[],
  fileContents: Map<string, string>,
  parsedModules: Map<string, ParsedModule>
): Map<string, { path: string; usageCount: number; usedBy: string[] }> {
  const usages = new Map<string, { path: string; usageCount: number; usedBy: string[] }>();

  for (const pagePath of pagePaths) {
    const resolved = resolveComponentDependencies(pagePath, fileContents, parsedModules);

    function collectUsage(node: ResolvedComponent) {
      for (const dep of node.dependencies) {
        const existing = usages.get(dep.path);
        if (existing) {
          existing.usageCount++;
          if (!existing.usedBy.includes(pagePath)) {
            existing.usedBy.push(pagePath);
          }
        } else {
          usages.set(dep.path, {
            path: dep.path,
            usageCount: 1,
            usedBy: [pagePath],
          });
        }
        collectUsage(dep);
      }
    }

    collectUsage(resolved);
  }

  // Filter to only shared components (used by multiple pages)
  const shared = new Map<string, { path: string; usageCount: number; usedBy: string[] }>();
  for (const [path, data] of usages) {
    if (data.usageCount > 1) {
      shared.set(path, data);
    }
  }

  return shared;
}
