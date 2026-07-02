/**
 * Fuzzy Accelerated Route Matcher
 *
 * Implements a fallback destination scanner inside the file tokenization layer.
 * If no explicit 'router.push' or '<Link>' tag is parsed, executes a regex sweep
 * that extracts all string literals matching active directory route pathways.
 *
 * When an exact string match for an existing system route is found within the
 * page component context, automatically establishes a low-opacity manual
 * reference wire connecting the two nodes on the canvas.
 */

import type { ParsedModule } from "./ast-parser";
import type { NormalizedRoute } from "./route-normalizer";

/**
 * A detected route reference in source code.
 */
export interface DetectedRouteReference {
  /** The route path that was referenced */
  routePath: string;
  /** How the route was detected */
  detectionType: "explicit" | "fuzzy" | "inferred";
  /** Source file containing the reference */
  sourcePath: string;
  /** Line number in the source */
  line?: number;
  /** The matched string literal */
  matchedLiteral: string;
  /** Confidence score (0-1) */
  confidence: number;
  /** The surrounding code context */
  context: string;
}

/**
 * A route reference edge for the canvas.
 */
export interface RouteReferenceEdge {
  /** ID for the edge */
  id: string;
  /** Source route key */
  fromRouteKey: string;
  /** Target route key */
  toRouteKey: string;
  /** Source file that contains the reference */
  viaFile: string;
  /** Detection method */
  detectionType: "explicit" | "fuzzy" | "inferred";
  /** Confidence score */
  confidence: number;
  /** Opacity for rendering (low for fuzzy matches) */
  renderOpacity: number;
  /** Whether this is a manual reference (low confidence) */
  isManualReference: boolean;
}

/**
 * Pattern types for route detection.
 */
type RoutePattern = {
  pattern: RegExp;
  type: "explicit" | "fuzzy" | "inferred";
  extractPath: (match: RegExpExecArray) => string;
  confidence: number;
};

/**
 * Build a set of known route paths from normalized routes.
 */
function buildKnownRoutesSet(routes: NormalizedRoute[]): Set<string> {
  const known = new Set<string>();

  for (const route of routes) {
    known.add(route.normalizedPath);
    known.add(route.pattern);
    // Also add the original path for matching
    if (route.originalPath) {
      // Extract route path from file path
      const pathMatch = route.originalPath.match(/\/(app|pages)\/(.+)\/page\./);
      if (pathMatch) {
        const rawPath = "/" + pathMatch[2].replace(/\/page\.$/, "");
        known.add(rawPath);
      }
    }
  }

  return known;
}

/**
 * Get all regex patterns for route detection.
 */
function getRoutePatterns(): RoutePattern[] {
  return [
    // Explicit: router.push("/path")
    {
      pattern: /router\.(?:push|replace)\s*\(\s*["'`]([^"'`]+)["'`]/g,
      type: "explicit",
      extractPath: (m) => m[1],
      confidence: 0.95,
    },
    // Explicit: navigate({ to: "/path" })
    {
      pattern: /navigate\s*\(\s*\{\s*to\s*:\s*["'`]([^"'`]+)["'`]/g,
      type: "explicit",
      extractPath: (m) => m[1],
      confidence: 0.95,
    },
    // Explicit: <Link to="/path">
    {
      pattern: /<Link[^>]*\bto\s*=\s*["'`]([^"'`]+)["'`]/g,
      type: "explicit",
      extractPath: (m) => m[1],
      confidence: 0.95,
    },
    // Explicit: <Link href="/path">
    {
      pattern: /<Link[^>]*\bhref\s*=\s*["'`]([^"'`]+)["'`]/g,
      type: "explicit",
      extractPath: (m) => m[1],
      confidence: 0.9,
    },
    // Explicit: <a href="/path">
    {
      pattern: /<a[^>]*\bhref\s*=\s*["'`]([^"'`]+)["'`]/g,
      type: "explicit",
      extractPath: (m) => m[1],
      confidence: 0.85,
    },
    // Explicit: history.push("/path")
    {
      pattern: /history\.(?:push|replace)\s*\(\s*["'`]([^"'`]+)["'`]/g,
      type: "explicit",
      extractPath: (m) => m[1],
      confidence: 0.9,
    },
    // Fuzzy: pathname === "/path"
    {
      pattern: /pathname\s*===?\s*["'`]([^"'`]+)["'`]/g,
      type: "fuzzy",
      extractPath: (m) => m[1],
      confidence: 0.7,
    },
    // Fuzzy: isPath("/path")
    {
      pattern: /is(?:Path|Route)\s*\(\s*["'`]([^"'`]+)["'`]\)/g,
      type: "fuzzy",
      extractPath: (m) => m[1],
      confidence: 0.8,
    },
    // Fuzzy: redirect("/path")
    {
      pattern: /(?:redirect|redirectToRoute)\s*\(\s*["'`]([^"'`]+)["'`]/g,
      type: "fuzzy",
      extractPath: (m) => m[1],
      confidence: 0.85,
    },
    // Inferred: string literal starting with /
    {
      pattern: /["'`]([\/][\w\-\/\:\.\[\]]+)["'`]/g,
      type: "inferred",
      extractPath: (m) => m[1],
      confidence: 0.4,
    },
  ];
}

/**
 * Checks if a string looks like a valid route path.
 */
function looksLikeRoutePath(str: string): boolean {
  // Must start with /
  if (!str.startsWith("/")) return false;

  // Must not be a file path (contains extension)
  if (/\.[a-z]{2,4}$/.test(str) && !str.startsWith("/api/")) return false;

  // Must not be a URL (contains protocol)
  if (/^https?:\/\//.test(str)) return false;

  // Must not be a data URL
  if (str.startsWith("/data:")) return false;

  // Length check - routes are typically short
  if (str.length > 100) return false;

  // Should contain only valid route characters
  if (!/^\/[\w\-\/\:\.\[\]\{\}\(\)\*\?\+]*$/.test(str)) return false;

  return true;
}

/**
 * Extracts the surrounding context from source code.
 */
function extractContext(source: string, index: number, contextSize = 50): string {
  const start = Math.max(0, index - contextSize);
  const end = Math.min(source.length, index + contextSize);
  return source.substring(start, end).replace(/\s+/g, " ").trim();
}

/**
 * Gets the line number from character position.
 */
function getLineNumber(source: string, position: number): number {
  return source.substring(0, position).split("\n").length;
}

/**
 * Scans a module for route references.
 *
 * @param module - The parsed module to scan
 * @param knownRoutes - Set of known route paths
 * @returns Array of detected route references
 */
export function scanForRouteReferences(
  module: ParsedModule,
  knownRoutes: Set<string>
): DetectedRouteReference[] {
  const references: DetectedRouteReference[] = [];
  const seen = new Set<string>();
  const source = module.source;

  if (!source) return references;

  const patterns = getRoutePatterns();

  for (const { pattern, type, extractPath, confidence } of patterns) {
    // Reset regex lastIndex
    pattern.lastIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = pattern.exec(source)) !== null) {
      const path = extractPath(match);
      const key = `${type}:${path}:${match.index}`;

      // Dedupe
      if (seen.has(key)) continue;
      seen.add(key);

      // Check if this looks like a route
      if (!looksLikeRoutePath(path)) continue;

      // Check if this matches a known route
      const matchedRoute = findMatchingRoute(path, knownRoutes);
      if (!matchedRoute) continue;

      const line = getLineNumber(source, match.index);
      const context = extractContext(source, match.index);

      references.push({
        routePath: matchedRoute,
        detectionType: type,
        sourcePath: module.path,
        line,
        matchedLiteral: path,
        confidence,
        context,
      });
    }
  }

  return references;
}

/**
 * Finds a matching route in the known routes set.
 * Handles fuzzy matching for parameterized routes.
 */
function findMatchingRoute(path: string, knownRoutes: Set<string>): string | null {
  // Exact match
  if (knownRoutes.has(path)) return path;

  // Try without trailing slash
  const normalized = path.replace(/\/$/, "") || "/";
  if (knownRoutes.has(normalized)) return normalized;

  // Try matching parameterized routes
  for (const route of knownRoutes) {
    // Convert :param to regex
    const pattern = route
      .replace(/:\w+\*/g, ".+")
      .replace(/:\w+\?/g, "[^/]*")
      .replace(/:\w+/g, "[^/]+");

    if (new RegExp(`^${pattern}$`).test(path)) {
      return route;
    }
  }

  // Prefix match for nested routes
  for (const route of knownRoutes) {
    if (route.startsWith(path) || path.startsWith(route.split("/:")[0])) {
      // Only if high similarity
      if (calculateSimilarity(path, route) > 0.6) {
        return route;
      }
    }
  }

  return null;
}

/**
 * Calculates string similarity (Jaccard coefficient).
 */
function calculateSimilarity(a: string, b: string): number {
  const setA = new Set(a.split(""));
  const setB = new Set(b.split(""));
  const intersection = new Set([...setA].filter((x) => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return intersection.size / union.size;
}

/**
 * Generates route reference edges from detected references.
 *
 * @param modulePath - The source module path
 * @param routeKey - The route key for the source module
 * @param references - Detected route references
 * @returns Array of route reference edges
 */
export function generateRouteReferenceEdges(
  modulePath: string,
  routeKey: string,
  references: DetectedRouteReference[]
): RouteReferenceEdge[] {
  let edgeCounter = 0;

  const edges: RouteReferenceEdge[] = [];
  const seen = new Set<string>();

  for (const ref of references) {
    const edgeKey = `${routeKey}->${ref.routePath}`;

    if (seen.has(edgeKey)) continue;
    seen.add(edgeKey);

    // Compute opacity based on confidence
    const opacity = ref.confidence < 0.5 ? 0.25 : ref.confidence < 0.8 ? 0.4 : 0.6;
    const isManualReference = ref.detectionType === "inferred";

    edges.push({
      id: `route_ref_${++edgeCounter}`,
      fromRouteKey: routeKey,
      toRouteKey: ref.routePath,
      viaFile: modulePath,
      detectionType: ref.detectionType,
      confidence: ref.confidence,
      renderOpacity: opacity,
      isManualReference,
    });
  }

  return edges;
}

/**
 * Main function: Scan all modules for route references and generate edges.
 *
 * @param modules - All parsed modules
 * @param routes - All normalized routes
 * @returns Array of route reference edges for the canvas
 */
export function analyzeRouteReferences(
  modules: ParsedModule[],
  routes: NormalizedRoute[]
): RouteReferenceEdge[] {
  const knownRoutes = buildKnownRoutesSet(routes);
  const routeByPath = new Map<string, NormalizedRoute>();

  for (const route of routes) {
    routeByPath.set(route.normalizedPath, route);
  }

  // Build module path → route key mapping
  const moduleToRoute = new Map<string, string>();
  for (const route of routes) {
    moduleToRoute.set(route.originalPath, route.normalizedPath);
  }

  const allEdges: RouteReferenceEdge[] = [];

  for (const module of modules) {
    // Check if this module is a route page
    const routeKey = moduleToRoute.get(module.path);
    if (!routeKey) continue;

    // Scan for route references
    const references = scanForRouteReferences(module, knownRoutes);
    const edges = generateRouteReferenceEdges(module.path, routeKey, references);

    allEdges.push(...edges);
  }

  // Sort by confidence (highest first)
  return allEdges.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Filters edges to only include the most confident references.
 */
export function filterHighConfidenceEdges(
  edges: RouteReferenceEdge[],
  minConfidence = 0.5
): RouteReferenceEdge[] {
  const seen = new Set<string>();
  const filtered: RouteReferenceEdge[] = [];

  for (const edge of edges) {
    const key = `${edge.fromRouteKey}->${edge.toRouteKey}`;
    if (seen.has(key)) continue;

    if (edge.confidence >= minConfidence) {
      seen.add(key);
      filtered.push(edge);
    }
  }

  return filtered;
}

/**
 * Merges route reference edges with blueprint edges.
 * Low-confidence edges get different styling.
 */
export function mergeRouteReferenceEdges(
  blueprintEdges: Array<{ from: string; to: string; label?: string }>,
  routeRefEdges: RouteReferenceEdge[]
): Array<{
  from: string;
  to: string;
  label?: string;
  isReference?: boolean;
  referenceType?: "explicit" | "fuzzy" | "inferred";
  opacity?: number;
}> {
  const merged: Array<{
    from: string;
    to: string;
    label?: string;
    isReference?: boolean;
    referenceType?: "explicit" | "fuzzy" | "inferred";
    opacity?: number;
  }> = [...blueprintEdges];

  for (const refEdge of routeRefEdges) {
    // Only add if not already present as a blueprint edge
    const exists = merged.some(
      (e) => e.from === refEdge.fromRouteKey && e.to === refEdge.toRouteKey
    );

    if (!exists) {
      merged.push({
        from: refEdge.fromRouteKey,
        to: refEdge.toRouteKey,
        label: refEdge.isManualReference ? "ref" : undefined,
        isReference: true,
        referenceType: refEdge.detectionType,
        opacity: refEdge.renderOpacity,
      });
    }
  }

  return merged;
}
