/**
 * Route Parameter Normalization Engine
 *
 * Processes directory names containing dynamic parameters (brackets matching
 * '[id]', '[slug]', or '[...param]') and translates them into standard clean
 * URL parameters.
 *
 * Also provides shape metadata for canvas rendering to distinguish dynamic
 * routes with dashed perimeter borders.
 */

import type { Shape } from "./canvas-geometry";

/**
 * Normalized route with detected dynamic parameters.
 */
export interface NormalizedRoute {
  /** The original file path, e.g., 'app/products/[id]/page.tsx' */
  originalPath: string;
  /** Clean URL path, e.g., '/products/:id' */
  normalizedPath: string;
  /** Human-readable label for the canvas */
  label: string;
  /** Route pattern for matching, e.g., '/products/:id' */
  pattern: string;
  /** Detected dynamic parameters */
  params: RouteParameter[];
  /** Whether this route is dynamic */
  isDynamic: boolean;
  /** Whether this route is a catch-all */
  isCatchAll: boolean;
  /** Shape variant for canvas rendering */
  shapeVariant: "static" | "dynamic" | "catch-all";
  /** CSS style hints for the canvas node */
  styleHints: RouteStyleHints;
}

/**
 * A detected dynamic route parameter.
 */
export interface RouteParameter {
  /** Parameter name without brackets, e.g., 'id' or '...slug' */
  name: string;
  /** Clean parameter name (without spread operator) */
  cleanName: string;
  /** Whether this is an optional catch-all */
  isOptional: boolean;
  /** Whether this is a catch-all (spread) parameter */
  isCatchAll: boolean;
  /** The segment that contains this param, e.g., '[id]' */
  rawSegment: string;
  /** Position in the path segments array */
  segmentIndex: number;
}

/**
 * CSS style hints for rendering route nodes on canvas.
 */
export interface RouteStyleHints {
  /** Border style for the node shape */
  borderStyle: "solid" | "dashed" | "dotted";
  /** Border dash pattern (for SVG stroke-dasharray) */
  borderDashArray: string;
  /** Opacity multiplier (0-1) for dynamic routes */
  opacity: number;
  /** Whether to show a param indicator badge */
  showParamBadge: boolean;
  /** Text for the param badge */
  paramBadgeText: string;
}

/**
 * Regex patterns for detecting dynamic route parameters.
 */
const DYNAMIC_PARAM_REGEX = /\[([^\]]+)\]/g;
const CATCH_ALL_REGEX = /^\.{3}(.+)$/;
const OPTIONAL_REGEX = /^\[\[(.+)\]\]$/;

/**
 * Normalizes a file path into a clean URL path with standard parameters.
 *
 * @example
 * normalizeRoutePath('app/products/[id]/page.tsx') // '/products/:id'
 * normalizeRoutePath('app/blog/[...slug]/page.tsx') // '/blog/:slug*'
 * normalizeRoutePath('app/(auth)/login/page.tsx') // '/login'
 */
export function normalizeRoutePath(
  filePath: string,
  routerType: "app-router" | "pages-router" | "spa" = "app-router"
): NormalizedRoute {
  const params: RouteParameter[] = [];
  let isCatchAll = false;
  let isOptional = false;

  // Extract the route segments based on router type
  let segments: string[] = [];

  if (routerType === "app-router") {
    // Match app/.../page.tsx pattern
    const match = filePath.match(/(?:^|\/)app\/(.+)\/page\.(tsx|ts|js|jsx)$/);
    if (match) {
      segments = match[1].split("/");
    }
    // Handle root page
    if (/(?:^|\/)app\/page\.(tsx|ts|js|jsx)$/.test(filePath)) {
      segments = [];
    }
  } else if (routerType === "pages-router") {
    // Match pages/...pattern
    const match = filePath.match(/(?:^|\/)pages\/(.+)\.(tsx|ts|js|jsx)$/);
    if (match) {
      segments = match[1].split("/");
      // Handle index routes
      if (segments[segments.length - 1] === "index") {
        segments.pop();
      }
    }
  } else {
    // SPA: just use the path as-is
    segments = filePath.split("/");
  }

  // Process each segment
  const normalizedSegments: string[] = [];

  segments.forEach((segment, index) => {
    // Skip route groups like (auth)
    if (segment.startsWith("(") && segment.endsWith(")")) {
      return;
    }

    // Check for dynamic parameters
    const paramMatches = segment.matchAll(DYNAMIC_PARAM_REGEX);
    let normalizedSegment = segment;
    let segmentIndex = 0;

    for (const match of paramMatches) {
      const rawParam = match[1]; // e.g., 'id', '...slug'
      const isSpread = CATCH_ALL_REGEX.test(rawParam);
      const spreadName = isSpread ? rawParam.slice(3) : rawParam;
      const isOpt = OPTIONAL_REGEX.test(segment);

      if (isSpread) {
        isCatchAll = true;
        // Convert [...slug] to :slug* (Express-style catch-all)
        normalizedSegment = segment.replace(`[...${spreadName}]`, `:${spreadName}*`);
      } else if (isOpt) {
        isOptional = true;
        // Convert [[slug]] to :slug?
        normalizedSegment = segment.replace(`[[${rawParam}]]`, `:${rawParam}?`);
      } else {
        // Convert [id] to :id
        normalizedSegment = normalizedSegment.replace(`[${rawParam}]`, `:${rawParam}`);
      }

      params.push({
        name: rawParam,
        cleanName: spreadName || rawParam,
        isOptional: isOpt,
        isCatchAll: isSpread,
        rawSegment: match[0],
        segmentIndex: index,
      });

      segmentIndex++;
    }

    // Remove any remaining bracket notation
    normalizedSegment = normalizedSegment.replace(/[\[\]]/g, "");

    if (normalizedSegment) {
      normalizedSegments.push(normalizedSegment);
    }
  });

  // Build the normalized path
  const normalizedPath = "/" + normalizedSegments.join("/") || "/";
  const pattern = normalizedPath;

  // Determine style hints based on route type
  const isDynamic = params.length > 0;
  const styleHints = computeStyleHints(isDynamic, isCatchAll, isOptional, params);

  // Generate a human-readable label
  const label = generateRouteLabel(normalizedPath, params);

  // Determine shape variant
  const shapeVariant: NormalizedRoute["shapeVariant"] = isCatchAll
    ? "catch-all"
    : isDynamic
    ? "dynamic"
    : "static";

  return {
    originalPath: filePath,
    normalizedPath,
    label,
    pattern,
    params,
    isDynamic,
    isCatchAll,
    shapeVariant,
    styleHints,
  };
}

/**
 * Computes CSS style hints for rendering a route node.
 */
function computeStyleHints(
  isDynamic: boolean,
  isCatchAll: boolean,
  isOptional: boolean,
  params: RouteParameter[]
): RouteStyleHints {
  if (isCatchAll) {
    return {
      borderStyle: "dashed",
      borderDashArray: "8 4", // Long dashes for catch-all
      opacity: 0.85,
      showParamBadge: true,
      paramBadgeText: `:${params[0]?.cleanName || "slug"}*`,
    };
  }

  if (isDynamic) {
    return {
      borderStyle: "dashed",
      borderDashArray: "5 5", // Medium dashes for dynamic
      opacity: 0.9,
      showParamBadge: true,
      paramBadgeText: params.map((p) => `:${p.cleanName}`).join(", "),
    };
  }

  return {
    borderStyle: "solid",
    borderDashArray: "none",
    opacity: 1,
    showParamBadge: false,
    paramBadgeText: "",
  };
}

/**
 * Generates a human-readable label for the route.
 */
function generateRouteLabel(path: string, params: RouteParameter[]): string {
  if (params.length === 0) {
    return path;
  }

  // Replace :param with clearer indicator
  let label = path;
  for (const param of params) {
    if (param.isCatchAll) {
      label = label.replace(`:${param.cleanName}*`, `[${param.cleanName}...]`);
    } else if (param.isOptional) {
      label = label.replace(`:${param.cleanName}?`, `[${param.cleanName}?]`);
    } else {
      label = label.replace(`:${param.cleanName}`, `[${param.cleanName}]`);
    }
  }

  return label;
}

/**
 * Checks if a route matches a given URL pattern.
 */
export function routeMatchesPattern(
  routePattern: string,
  urlPath: string
): boolean {
  // Convert :param to regex
  const regexPattern = routePattern
    .replace(/:\w+\*/g, "(.+)") // catch-all
    .replace(/:\w+\?/g, "([^/]+)?") // optional
    .replace(/:\w+/g, "([^/]+)"); // required

  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(urlPath);
}

/**
 * Extracts parameter values from a URL matching a route pattern.
 */
export function extractRouteParams(
  routePattern: string,
  urlPath: string
): Map<string, string> | null {
  const params = new Map<string, string>();

  // Get param names from pattern
  const paramNames = routePattern.match(/:\w+[*?]?/g) || [];

  // Convert to regex
  const regexPattern = routePattern
    .replace(/:(\w+)\*/g, "(.+)")
    .replace(/:(\w+)\?/g, "([^/]+)?")
    .replace(/:(\w+)/g, "([^/]+)");

  const regex = new RegExp(`^${regexPattern}$`);
  const match = urlPath.match(regex);

  if (!match) return null;

  // Map param names to captured groups
  paramNames.forEach((name, index) => {
    const cleanName = name.replace(/[:*?]/g, "");
    params.set(cleanName, match[index + 1] || "");
  });

  return params;
}

/**
 * Gets the SVG stroke-dasharray value for a shape.
 */
export function getStrokeDashArray(shapeVariant: NormalizedRoute["shapeVariant"]): string {
  switch (shapeVariant) {
    case "catch-all":
      return "8 4";
    case "dynamic":
      return "5 5";
    default:
      return "none";
  }
}

/**
 * Gets the shape to use for a route node.
 * Dynamic routes can use a different shape to stand out.
 */
export function getRouteShape(
  route: NormalizedRoute,
  defaultShape: Shape = "pill"
): Shape {
  // Keep the default shape but return style hints separately
  return defaultShape;
}

/**
 * Batch normalizes multiple route files.
 */
export function normalizeRoutes(
  filePaths: string[],
  routerType: "app-router" | "pages-router" | "spa" = "app-router"
): NormalizedRoute[] {
  const routes: NormalizedRoute[] = [];
  const seen = new Set<string>();

  for (const path of filePaths) {
    const normalized = normalizeRoutePath(path, routerType);
    if (!seen.has(normalized.normalizedPath)) {
      seen.add(normalized.normalizedPath);
      routes.push(normalized);
    }
  }

  // Sort: static routes first, then dynamic, then catch-all
  return routes.sort((a, b) => {
    if (a.isDynamic !== b.isDynamic) return a.isDynamic ? 1 : -1;
    if (a.isCatchAll !== b.isCatchAll) return a.isCatchAll ? 1 : -1;
    return a.normalizedPath.localeCompare(b.normalizedPath);
  });
}
