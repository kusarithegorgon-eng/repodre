/**
 * Repository Crawler — Zero-Knowledge Local Codebase Scanner
 *
 * A lightweight, AST-free analysis engine that runs whenever a repository
 * file tree is uploaded. Unlike the blueprint-analyzer (which requires
 * parsed AST modules), this crawler works directly on:
 *
 *   1. A flat list of file paths (the directory tree)
 *   2. A map of file path → raw source content
 *
 * It produces a FlowchartGraph of Page View Nodes, Action Nodes, and
 * Validation Diamond Nodes with directional edges — ready for the canvas.
 *
 * Pipeline:
 *   1. ROUTE CRAWL — scan file paths for page.tsx / page.jsx / index.js
 *      patterns (Next.js App Router, Pages Router, CRA/Vite index.js).
 *      Extract route names from directory paths and instantiate Page View Nodes.
 *   2. INTERACTION EXTRACTION — regex-scan page file contents for <Link>,
 *      router.push(), onClick, onSubmit. If a target matches a known route,
 *      create an Action Node and a directional wire.
 *   3. VALIDATION DETECTION — scan for zod/yup/joi schemas or if/else gates
 *      preceding API mutations or routing steps. Insert a Validation Diamond
 *      that fractures the direct edge into Success and Failure branches.
 */

import type { Shape } from "./canvas-geometry";

// ─── Types ──────────────────────────────────────────────────────────────────

export type CrawlerAccent = "green" | "purple" | "teal" | "blue" | "orange" | "red";

export type CrawlerNodeType = "page" | "action" | "validation";

export interface CrawlerNode {
  id: string;
  type: CrawlerNodeType;
  label: string;
  sub: string;
  shape: Shape;
  accent: CrawlerAccent;
  /** source file path that produced this node */
  sourcePath?: string;
  /** line number of the detected construct */
  line?: number;
  /** the route path this page represents (for page nodes only) */
  route?: string;
  /** true if this page's route contains dynamic parameters (dashed border) */
  dynamic?: boolean;
}

export type EdgeKind = "navigation" | "action" | "success" | "failure" | "reference";

export interface CrawlerEdge {
  id: string;
  from: string;
  to: string;
  kind: EdgeKind;
  label?: string;
  /** low-opacity for fuzzy/inferred reference edges */
  inferred?: boolean;
}

export interface FlowchartGraph {
  nodes: CrawlerNode[];
  edges: CrawlerEdge[];
  stats: {
    pages: number;
    actions: number;
    validations: number;
    edges: number;
  };
}

// ─── Route path extraction ──────────────────────────────────────────────────

interface RawRoute {
  /** the route path, e.g. "/billing/history" */
  route: string;
  /** the source file path */
  file: string;
  /** which framework pattern matched */
  pattern: "app-router" | "pages-router" | "vite-index";
  /** true if the route contains dynamic parameters */
  dynamic: boolean;
}

/**
 * Scan a list of file paths and detect all route-bearing files.
 *
 * Recognized patterns:
 *   - Next.js App Router:  app/page.tsx, app/page.jsx, app/page.ts, app.page.js
 *   - Next.js Pages Router: pages/tsx, pages/jsx, pages/ts, pages/js
 *   - Express.js:          routes/*.js, server.js, app.js (via HTTP method patterns)
 *   - Vite/CRA:            src/index.js, src/index.jsx (root entry only)
 *   - Generic:             any/index.js, any/index.jsx (when in a route-like directory)
 */
export function crawlRoutes(filePaths: string[]): RawRoute[] {
  const routes: RawRoute[] = [];
  const seen = new Set<string>();

  for (const p of filePaths) {
    // ── Next.js App Router: app/**/page.{tsx,ts,js,jsx} ────────────────
    let m = p.match(/(?:^|\/)app\/(.+)\/page\.(tsx|ts|js|jsx)$/);
    if (m) {
      const { route, dynamic } = normalizeRoute(m[1]);
      if (!seen.has(route)) {
        seen.add(route);
        routes.push({ route, file: p, pattern: "app-router", dynamic });
      }
      continue;
    }

    // app/page.tsx → root "/"
    if (/(?:^|\/)app\/page\.(tsx|ts|js|jsx)$/.test(p)) {
      if (!seen.has("/")) {
        seen.add("/");
        routes.push({ route: "/", file: p, pattern: "app-router", dynamic: false });
      }
      continue;
    }

    // ── Next.js Pages Router: pages/**.{tsx,ts,js,jsx} ──────────────────
    m = p.match(/(?:^|\/)pages\/(.+)\.(tsx|ts|js|jsx)$/);
    if (m) {
      const seg = m[1];
      // Skip API routes and special files
      if (seg.startsWith("api/") || seg.startsWith("_")) continue;
      if (["_app", "_document", "_error", "404", "500"].includes(seg)) continue;
      const { route, dynamic } = normalizeRoute(seg);
      if (!seen.has(route)) {
        seen.add(route);
        routes.push({ route, file: p, pattern: "pages-router", dynamic });
      }
      continue;
    }

    // ── Express.js routes: routes/*.js or server files ──────────────────
    // Detected via HTTP method patterns in the source
    if (isExpressRouteFile(p) && p.endsWith(".js") || p.endsWith(".ts")) {
      // Mark these for later Express route extraction
      // We'll scan the source content during crawlRepository
      const baseName = p.split("/").pop()?.replace(/\.(js|ts)$/, "") || "api";
      if (!baseName.startsWith(".")) {
        // Placeholder route - actual paths extracted from source
        const routePath = `/api/${baseName}`;
        if (!seen.has(routePath)) {
          seen.add(routePath);
          routes.push({ route: routePath, file: p, pattern: "app-router", dynamic: false });
        }
      }
    }

    // ── Vite/CRA entry: src/index.js or src/index.jsx ──────────────────
    if (/(?:^|\/)src\/index\.(js|jsx|ts|tsx)$/.test(p)) {
      if (!seen.has("/")) {
        seen.add("/");
        routes.push({ route: "/", file: p, pattern: "vite-index", dynamic: false });
      }
      continue;
    }

    // ── Generic index.js/index.jsx in route-like directories ────────────
    // Only match if the directory path looks like a route segment
    // (not node_modules, not config dirs, not lib/utils)
    m = p.match(/(.+)\/index\.(js|jsx|ts|tsx)$/);
    if (m) {
      const dir = m[1];
      if (isRouteLikeDirectory(dir)) {
        const { route, dynamic } = normalizeRoute(dir);
        if (!seen.has(route)) {
          seen.add(route);
          routes.push({ route, file: p, pattern: "vite-index", dynamic });
        }
      }
    }
  }

  return routes.sort((a, b) => a.route.localeCompare(b.route));
}

/**
 * Check if a file path looks like an Express.js route file.
 */
function isExpressRouteFile(p: string): boolean {
  // Common Express route file patterns
  if (/(?:^|\/)routes?\//.test(p)) return true;
  if (/(?:^|\/)(server|app|main|index)\.(js|ts)$/.test(p)) return true;
  if (/(?:^|\/)api\//.test(p)) return true;
  // Controllers directory
  if (/(?:^|\/)controllers?\//.test(p)) return true;
  return false;
}

/**
 * Convert a file path segment into a route path.
 *   "billing/history"    → "/billing/history"
 *   "auth/login"          → "/auth/login"
 *   "[id]"                → "/:id"
 *   "[slug]"              → "/:slug"
 *   "[...slug]"           → "/:slug"
 *   "(auth)/login"        → "/login"
 *   "index"               → "/"
 *
 * Returns the normalized route and whether it contains dynamic parameters.
 */
function normalizeRoute(seg: string): { route: string; dynamic: boolean } {
  if (seg === "index" || seg === "") return { route: "/", dynamic: false };
  let s = seg.replace(/\/index$/, "");
  let dynamic = false;

  // Catch-all segments: [...slug] → :slug
  s = s.replace(/\[\.\.\.([\w]+)\]/g, (_match, name) => {
    dynamic = true;
    return `:${name}`;
  });

  // Dynamic segments: [id] → :id, [slug] → :slug
  s = s.replace(/\[([\w]+)\]/g, (_match, name) => {
    dynamic = true;
    return `:${name}`;
  });

  // Route groups: (auth) → removed
  s = s.replace(/\(([^)]+)\)/g, "");
  if (!s.startsWith("/")) s = "/" + s;
  s = s.replace(/\/+/g, "/");
  if (s.length > 1 && s.endsWith("/")) s = s.slice(0, -1);
  return { route: s || "/", dynamic };
}

/**
 * Heuristic: does this directory path look like a route directory?
 * Excludes node_modules, lib, utils, components, hooks, config, etc.
 */
function isRouteLikeDirectory(dir: string): boolean {
  const exclude = ["node_modules", "lib", "utils", "components", "hooks", "config", "public", "static", "assets", "styles", "types", "interfaces", "constants", "middleware", "services", "store", "context", "providers"];
  const parts = dir.split("/");
  for (const part of parts) {
    if (exclude.includes(part)) return false;
  }
  // Must have at least one segment that looks like a route (not a file extension)
  return parts.length >= 1 && !parts[parts.length - 1].includes(".");
}

// ─── Interaction extraction ─────────────────────────────────────────────────

export interface DetectedInteraction {
  /** the kind of interaction */
  kind: "link" | "router-push" | "on-click" | "on-submit";
  /** the target route or action label */
  target: string;
  /** line number in the source */
  line: number;
  /** raw matched text */
  match: string;
}

/**
 * Scan a file's source content for navigation and interaction patterns.
 *
 * Detects:
 *   - <Link href="/path"> (Next.js Link)
 *   - router.push("/path"), router.replace("/path")
 *   - navigate("/path") (React Router v6)
 *   - onClick={...}, onSubmit={...}
 *   - Express.js: app.get("/path", ...), router.post("/path", ...)
 */
export function extractExpressRoutes(source: string, filePath: string): RawRoute[] {
  const routes: RawRoute[] = [];
  const seen = new Set<string>();

  // Express patterns: app.get(), app.post(), router.get(), router.post(), etc.
  const expressRe = /(?:app|router)\s*\.\s*(get|post|put|delete|patch|all)\s*\(\s*['"`]([^'"`]+)['"`]/g;
  let m: RegExpExecArray | null;
  while ((m = expressRe.exec(source)) !== null) {
    const routePath = m[2];
    if (seen.has(routePath)) continue;
    seen.add(routePath);

    const dynamic = routePath.includes(":") || routePath.includes("*");
    routes.push({
      route: routePath,
      file: filePath,
      pattern: "app-router",
      dynamic,
    });
  }

  return routes;
}

/**
 * Scan a file's source content for navigation and interaction patterns.
 *
 * Detects:
 *   - <Link href="/path"> (Next.js Link)
 *   - router.push("/path"), router.replace("/path")
 *   - navigate("/path") (React Router v6)
 *   - onClick={...}, onSubmit={...}
 */
export function extractInteractions(source: string): DetectedInteraction[] {
  const out: DetectedInteraction[] = [];
  const seen = new Set<string>();

  const add = (kind: DetectedInteraction["kind"], target: string, index: number, match: string) => {
    const line = source.substring(0, index).split("\n").length;
    const key = `${kind}:${target}:${line}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ kind, target, line, match });
  };

  // <Link href="/path"> or <Link href={'/path'}>
  const linkRe = /<Link[^>]*\bhref\s*=\s*\{?\s*['"`]([^'"`]+)['"`]/g;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(source)) !== null) {
    add("link", m[1], m.index, m[0]);
  }

  // router.push("/path"), router.replace("/path")
  const routerRe = /router\.(push|replace)\s*\(\s*['"`]([^'"`]+)['"`]/g;
  while ((m = routerRe.exec(source)) !== null) {
    add("router-push", m[2], m.index, m[0]);
  }

  // navigate("/path") — React Router v6
  const navigateRe = /\bnavigate\s*\(\s*['"`]([^'"`]+)['"`]/g;
  while ((m = navigateRe.exec(source)) !== null) {
    add("router-push", m[1], m.index, m[0]);
  }

  // onClick={...} — interactive event triggers
  const onClickRe = /\bonClick\s*=\s*\{/g;
  while ((m = onClickRe.exec(source)) !== null) {
    // Try to extract a target from the handler body (router.push, href, etc.)
    const after = source.slice(m.index, m.index + 300);
    const targetMatch = after.match(/(?:router\.(?:push|replace)|navigate)\s*\(\s*['"`]([^'"`]+)['"`]/);
    const target = targetMatch ? targetMatch[1] : "event-handler";
    add("on-click", target, m.index, m[0]);
  }

  // onSubmit={...} — form submission triggers
  const onSubmitRe = /\bonSubmit\s*=\s*\{/g;
  while ((m = onSubmitRe.exec(source)) !== null) {
    const after = source.slice(m.index, m.index + 300);
    const targetMatch = after.match(/(?:router\.(?:push|replace)|navigate|fetch)\s*\(\s*['"`]([^'"`]+)['"`]/);
    const target = targetMatch ? targetMatch[1] : "form-submit";
    add("on-submit", target, m.index, m[0]);
  }

  return out;
}

// ─── Validation detection ───────────────────────────────────────────────────

export interface DetectedValidationGate {
  /** which validation library was detected */
  kind: "zod" | "yup" | "joi" | "if-else";
  /** label for the diamond node */
  label: string;
  /** line number in the source */
  line: number;
  /** raw matched snippet */
  match: string;
}

/**
 * Scan a file's source for validation gates preceding API mutations or
 * routing steps.
 *
 * Detects:
 *   - Zod:   z.object(), z.string(), .safeParse(), .parse()
 *   - Yup:   yup.object(), yup.string(), .validate()
 *   - Joi:   Joi.object(), Joi.string(), .validate()
 *   - if/else: if (!session), if (!form), if (errors), if (!isValid)
 */
export function detectValidationGates(source: string): DetectedValidationGate[] {
  const out: DetectedValidationGate[] = [];
  const seen = new Set<string>();

  const add = (kind: DetectedValidationGate["kind"], label: string, index: number, match: string) => {
    const line = source.substring(0, index).split("\n").length;
    const key = `${kind}:${line}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ kind, label, line, match });
  };

  // ── Zod ──────────────────────────────────────────────────────────────
  const zodRe = /z\.\s*(object|string|number|email|password|boolean|date|enum|array)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = zodRe.exec(source)) !== null) {
    add("zod", "Zod Schema", m.index, m[0]);
  }
  const zodParseRe = /\.(safe)?[Pp]arse\s*\(/g;
  while ((m = zodParseRe.exec(source)) !== null) {
    add("zod", "Zod Parse", m.index, m[0]);
  }

  // ── Yup ──────────────────────────────────────────────────────────────
  const yupRe = /yup\.\s*(object|string|number|boolean|date|array)\s*\(/g;
  while ((m = yupRe.exec(source)) !== null) {
    add("yup", "Yup Schema", m.index, m[0]);
  }
  const yupValidateRe = /\.validate(?:Sync)?\s*\(/g;
  while ((m = yupValidateRe.exec(source)) !== null) {
    add("yup", "Yup Validate", m.index, m[0]);
  }

  // ── Joi ──────────────────────────────────────────────────────────────
  const joiRe = /Joi\.\s*(object|string|number|boolean|date|array|alternatives)\s*\(/g;
  while ((m = joiRe.exec(source)) !== null) {
    add("joi", "Joi Schema", m.index, m[0]);
  }

  // ── if/else guards ───────────────────────────────────────────────────
  // if (!session), if (!form), if (!isValid), if (errors), if (!token)
  const ifRe = /if\s*\(\s*!(session|token|user|form|isValid|authenticated|authorized|loading|data|req|res)\b/gi;
  while ((m = ifRe.exec(source)) !== null) {
    add("if-else", `Guard: !${m[1]}`, m.index, m[0]);
  }

  // if (errors) / if (error) / if (!valid)
  const ifErrorsRe = /if\s*\(\s*(errors?|!valid)\b/gi;
  while ((m = ifErrorsRe.exec(source)) !== null) {
    add("if-else", `Guard: ${m[1]}`, m.index, m[0]);
  }

  return out;
}

// ─── Component Recursive Dependency Resolver ─────────────────────────────────

export interface ResolvedImport {
  /** the import specifier as written, e.g. "./components/LoginForm" or "@/lib/auth" */
  specifier: string;
  /** the resolved file path in the repo, or null if unresolvable */
  resolvedPath: string | null;
  /** the raw source content of the imported file, or empty string */
  content: string;
  /** line number of the import statement */
  line: number;
}

/**
 * Parse import statements from a source file and return the specifiers.
 *
 * Matches:
 *   import X from "path"
 *   import { X } from "path"
 *   import X, { Y } from "path"
 *   import "path"  (side-effect import)
 *   const X = require("path")
 */
export function parseImports(source: string): ResolvedImport[] {
  const out: ResolvedImport[] = [];
  const seen = new Set<string>();

  // import ... from "specifier"
  const importRe = /\bimport\s+(?:[^'";]+\s+from\s+)?['"`]([^'"`]+)['"`]/g;
  let m: RegExpExecArray | null;
  while ((m = importRe.exec(source)) !== null) {
    const specifier = m[1];
    if (seen.has(specifier)) continue;
    seen.add(specifier);
    const line = source.substring(0, m.index).split("\n").length;
    out.push({ specifier, resolvedPath: null, content: "", line });
  }

  // require("specifier")
  const requireRe = /\brequire\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
  while ((m = requireRe.exec(source)) !== null) {
    const specifier = m[1];
    if (seen.has(specifier)) continue;
    seen.add(specifier);
    const line = source.substring(0, m.index).split("\n").length;
    out.push({ specifier, resolvedPath: null, content: "", line });
  }

  return out;
}

/**
 * Resolve an import specifier to a file path in the repository.
 *
 * Handles:
 *   - Relative paths: "./components/Button" → "app/billing/components/Button.tsx"
 *   - Path aliases: "@/components/Button" → "src/components/Button.tsx"
 *   - Extension resolution: tries .tsx, .ts, .jsx, .js, /index.tsx, /index.ts, etc.
 *
 * @param specifier - the import specifier string
 * @param importerPath - the file path of the importing file (for relative resolution)
 * @param filePaths - set of all file paths in the repository
 */
export function resolveImportPath(
  specifier: string,
  importerPath: string,
  filePaths: Set<string>,
): string | null {
  // Skip bare module imports (react, next, lodash, etc.)
  if (!specifier.startsWith(".") && !specifier.startsWith("@/")) {
    return null;
  }

  // Resolve relative to the importing file's directory
  let basePath: string;
  if (specifier.startsWith("@/")) {
    // Path alias: @/ → src/
    basePath = "src/" + specifier.slice(2);
  } else if (specifier.startsWith("./")) {
    const dir = importerPath.includes("/")
      ? importerPath.slice(0, importerPath.lastIndexOf("/"))
      : "";
    basePath = dir ? `${dir}/${specifier.slice(2)}` : specifier.slice(2);
  } else if (specifier.startsWith("../")) {
    const dir = importerPath.includes("/")
      ? importerPath.slice(0, importerPath.lastIndexOf("/"))
      : "";
    const parts = dir.split("/");
    const relParts = specifier.split("/");
    let up = 0;
    while (relParts[up] === "..") {
      up++;
      parts.pop();
    }
    basePath = [...parts, ...relParts.slice(up)].join("/");
  } else {
    return null;
  }

  // Try extensions and index files
  const extensions = [".tsx", ".ts", ".jsx", ".js", ".mjs", ".cjs"];
  for (const ext of extensions) {
    const candidate = basePath + ext;
    if (filePaths.has(candidate)) return candidate;
  }
  for (const ext of extensions) {
    const candidate = `${basePath}/index${ext}`;
    if (filePaths.has(candidate)) return candidate;
  }

  return null;
}

/**
 * Recursively resolve all imports for a page file and build a consolidated
 * source string that includes the page's own source plus all transitively
 * imported local components.
 *
 * This consolidated context is what the interaction extractor and validation
 * detector run against, so interactions defined in imported child components
 * (e.g., a <Link> inside a shared LoginForm.tsx) are captured.
 *
 * @param pagePath - the entry page file path
 * @param fileContents - map of all file paths to their raw source
 * @param filePaths - set of all file paths in the repo
 * @param maxDepth - recursion depth limit (default 5)
 */
export function buildConsolidatedSource(
  pagePath: string,
  fileContents: Map<string, string>,
  filePaths: Set<string>,
  maxDepth = 5,
): string {
  const visited = new Set<string>();
  const parts: string[] = [];

  function visit(path: string, depth: number) {
    if (depth > maxDepth) return;
    if (visited.has(path)) return;
    visited.add(path);

    const content = fileContents.get(path);
    if (!content) return;

    parts.push(content);

    // Parse and resolve imports
    const imports = parseImports(content);
    for (const imp of imports) {
      const resolved = resolveImportPath(imp.specifier, path, filePaths);
      if (resolved) {
        visit(resolved, depth + 1);
      }
    }
  }

  visit(pagePath, 0);
  return parts.join("\n\n");
}

// ─── Fuzzy Accelerated Route Matcher ─────────────────────────────────────────

/**
 * Extract all string literals from source code that look like route paths.
 *
 * Matches strings starting with "/" that contain path-like characters.
 * Excludes strings that look like file paths (have extensions), URLs with
 * protocols, or are too short to be routes.
 */
export function extractRouteLikeStrings(source: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  // Match single-quoted, double-quoted, and backtick strings starting with /
  const stringRe = /['"`](\/[a-zA-Z0-9_\-\/:{}.@?=&+~%]+)['"`]/g;
  let m: RegExpExecArray | null;
  while ((m = stringRe.exec(source)) !== null) {
    const s = m[1];
    // Skip file paths (have extensions like .png, .css)
    if (/\.[a-z0-9]{2,5}$/i.test(s)) continue;
    // Skip URLs with protocols
    if (s.startsWith("//")) continue;
    // Skip API endpoints that are too long (likely not routes)
    if (s.length > 100) continue;
    if (!seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  }

  return out;
}

/**
 * Fuzzy-match a string against known routes.
 *
 * Handles:
 *   - Exact match: "/billing" matches "/billing"
 *   - Dynamic segment match: "/users/123" matches "/users/:id"
 *   - Prefix match: "/billing/history" matches "/billing"
 *   - Substring match: "billing" matches "/billing"
 */
export function fuzzyMatchRoute(
  candidate: string,
  knownRoutes: string[],
): string | null {
  // Exact match
  if (knownRoutes.includes(candidate)) return candidate;

  for (const route of knownRoutes) {
    if (route === "/") continue;

    // Dynamic segment matching: /users/123 → /users/:id
    if (route.includes(":")) {
      const pattern = route.replace(/:[\w]+/g, "[^/]+");
      if (new RegExp("^" + pattern + "$").test(candidate)) return route;
    }
  }

  // Prefix match: candidate starts with a known route
  for (const route of knownRoutes) {
    if (route === "/") continue;
    if (candidate.startsWith(route + "/")) return route;
  }

  // Substring match: candidate contains the route path
  for (const route of knownRoutes) {
    if (route === "/" || route.length < 3) continue;
    if (candidate.includes(route) && candidate !== route) return route;
  }

  return null;
}

// ─── Graph builder ──────────────────────────────────────────────────────────

let nodeCounter = 0;
let edgeCounter = 0;

function nextNodeId(prefix: string): string {
  return `${prefix}_${++nodeCounter}`;
}

function nextEdgeId(): string {
  return `edge_${++edgeCounter}`;
}

function resetCounters() {
  nodeCounter = 0;
  edgeCounter = 0;
}

/**
 * Build a complete FlowchartGraph from a file tree and file contents.
 *
 * @param filePaths - all file paths in the repository
 * @param fileContents - map of file path → raw source content
 */
export function crawlRepository(
  filePaths: string[],
  fileContents: Map<string, string>,
): FlowchartGraph {
  resetCounters();

  const nodes: CrawlerNode[] = [];
  const edges: CrawlerEdge[] = [];
  const routeNodeIds = new Map<string, string>();
  const pageFileToNodeId = new Map<string, string>();
  const filePathSet = new Set(filePaths);

  // ── 1. ROUTE CRAWL: instantiate Page View Nodes ─────────────────────
  const routes = crawlRoutes(filePaths);

  // Also scan for Express routes in server files
  const expressRouteFiles = filePaths.filter((p) =>
    isExpressRouteFile(p) && (p.endsWith(".js") || p.endsWith(".ts"))
  );

  for (const file of expressRouteFiles) {
    const content = fileContents.get(file);
    if (content) {
      const expressRoutes = extractExpressRoutes(content, file);
      for (const r of expressRoutes) {
        if (!routeNodeIds.has(r.route)) {
          routes.push(r);
        }
      }
    }
  }

  // Dedupe routes by route path
  const dedupedRoutes = routes.filter((r, i, arr) =>
    arr.findIndex((x) => x.route === r.route) === i
  );

  for (const r of dedupedRoutes) {
    const id = nextNodeId("page");
    routeNodeIds.set(r.route, id);
    pageFileToNodeId.set(r.file, id);

    nodes.push({
      id,
      type: "page",
      label: r.route,
      sub: r.dynamic
        ? `Dynamic ${r.pattern === "app-router" ? "App Router" : r.pattern === "pages-router" ? "Pages Router" : "Entry"}`
        : r.pattern === "app-router" ? "App Router" : r.pattern === "pages-router" ? "Pages Router" : "Entry",
      shape: "rectangle",
      accent: "blue",
      sourcePath: r.file,
      route: r.route,
      dynamic: r.dynamic,
    });
  }

  const knownRoutes = Array.from(routeNodeIds.keys());

  // ── 2. INTERACTION EXTRACTION + CONSOLIDATED SOURCE ──────────────────
  for (const r of dedupedRoutes) {
    const pageSource = fileContents.get(r.file);
    if (!pageSource) continue;

    const sourcePageId = pageFileToNodeId.get(r.file);
    if (!sourcePageId) continue;

    // Build consolidated source: page + all transitively imported components
    const consolidatedSource = buildConsolidatedSource(
      r.file,
      fileContents,
      filePathSet,
    );

    // Run interaction extraction on the consolidated source
    const interactions = extractInteractions(consolidatedSource);
    const explicitTargets = new Set<string>();

    for (const interaction of interactions) {
      const target = interaction.target;
      explicitTargets.add(target);

      const targetRoute = resolveTargetRoute(target, routeNodeIds);
      const targetPageId = targetRoute ? routeNodeIds.get(targetRoute) : undefined;

      if (targetPageId && targetPageId !== sourcePageId) {
        // ── Check for validation gates ──────────────────────────────
        const validations = detectValidationGates(consolidatedSource);
        const relevantValidation = validations.find(
          (v) => v.line < interaction.line,
        );

        if (relevantValidation) {
          // ── 3. VALIDATION DIAMOND: fracture the edge ─────────────────
          const valId = nextNodeId("val");
          nodes.push({
            id: valId,
            type: "validation",
            label: relevantValidation.label,
            sub: relevantValidation.kind.toUpperCase(),
            shape: "diamond",
            accent: "orange",
            sourcePath: r.file,
            line: relevantValidation.line,
          });

          edges.push({
            id: nextEdgeId(),
            from: sourcePageId,
            to: valId,
            kind: "action",
            label: interaction.kind === "link" ? "Link" : interaction.kind === "router-push" ? "Redirect" : "Submit",
          });

          edges.push({
            id: nextEdgeId(),
            from: valId,
            to: targetPageId,
            kind: "success",
            label: "Success Path",
          });

          const failId = nextNodeId("err");
          nodes.push({
            id: failId,
            type: "action",
            label: "Error Response",
            sub: "Failure",
            shape: "rectangle",
            accent: "red",
            sourcePath: r.file,
            line: relevantValidation.line,
          });
          edges.push({
            id: nextEdgeId(),
            from: valId,
            to: failId,
            kind: "failure",
            label: "Failure Path",
          });
        } else {
          // ── Direct edge or action node ──────────────────────────────
          if (interaction.kind === "on-click" || interaction.kind === "on-submit") {
            const actionId = nextNodeId("action");
            nodes.push({
              id: actionId,
              type: "action",
              label: interaction.kind === "on-click" ? "Trigger Action" : "Trigger Redirection",
              sub: interaction.target,
              shape: "pill",
              accent: "teal",
              sourcePath: r.file,
              line: interaction.line,
            });

            edges.push({
              id: nextEdgeId(),
              from: sourcePageId,
              to: actionId,
              kind: "action",
              label: interaction.kind === "on-click" ? "onClick" : "onSubmit",
            });

            edges.push({
              id: nextEdgeId(),
              from: actionId,
              to: targetPageId,
              kind: "navigation",
              label: "Navigate",
            });
          } else {
            edges.push({
              id: nextEdgeId(),
              from: sourcePageId,
              to: targetPageId,
              kind: "navigation",
              label: interaction.kind === "link" ? "Link" : "Redirect",
            });
          }
        }
      } else if (interaction.kind === "on-click" || interaction.kind === "on-submit") {
        const actionId = nextNodeId("action");
        nodes.push({
          id: actionId,
          type: "action",
          label: interaction.kind === "on-click" ? "Trigger Action" : "Trigger Redirection",
          sub: interaction.target,
          shape: "pill",
          accent: "teal",
          sourcePath: r.file,
          line: interaction.line,
        });
        edges.push({
          id: nextEdgeId(),
          from: sourcePageId,
          to: actionId,
          kind: "action",
          label: interaction.kind === "on-click" ? "onClick" : "onSubmit",
        });
      }
    }

    // ── 3. FUZZY ACCELERATED ROUTE MATCHER (fallback) ───────────────────
    // If no explicit Link/router.push was found, sweep all string literals
    // in the consolidated source for route-like paths and fuzzy-match them
    // against known routes. Create low-opacity reference edges.
    const hasExplicitNavigation = interactions.some(
      (i) => i.kind === "link" || i.kind === "router-push",
    );

    if (!hasExplicitNavigation) {
      const routeStrings = extractRouteLikeStrings(consolidatedSource);
      const seenFuzzy = new Set<string>();

      for (const candidate of routeStrings) {
        // Skip strings already handled by explicit interactions
        if (explicitTargets.has(candidate)) continue;

        const matched = fuzzyMatchRoute(candidate, knownRoutes);
        if (!matched) continue;

        const targetPageId = routeNodeIds.get(matched);
        if (!targetPageId || targetPageId === sourcePageId) continue;

        // Avoid duplicate fuzzy edges
        const fuzzyKey = `${sourcePageId}->${targetPageId}`;
        if (seenFuzzy.has(fuzzyKey)) continue;
        seenFuzzy.add(fuzzyKey);

        edges.push({
          id: nextEdgeId(),
          from: sourcePageId,
          to: targetPageId,
          kind: "reference",
          label: "Reference",
          inferred: true,
        });
      }
    }
  }

  return {
    nodes,
    edges,
    stats: {
      pages: nodes.filter((n) => n.type === "page").length,
      actions: nodes.filter((n) => n.type === "action").length,
      validations: nodes.filter((n) => n.type === "validation").length,
      edges: edges.length,
    },
  };
}

/**
 * Resolve a target string (from a Link href or router.push) to a known
 * route in the project.
 */
function resolveTargetRoute(target: string, routeNodeIds: Map<string, string>): string | null {
  let t = target.trim();
  t = t.replace(/[?#].*$/, "");

  if (t.startsWith("./")) t = "/" + t.slice(2);
  if (t.startsWith("../")) t = "/" + t.slice(3);
  if (!t.startsWith("/")) t = "/" + t;

  if (routeNodeIds.has(t)) return t;

  // Dynamic segment matching
  for (const route of routeNodeIds.keys()) {
    if (route.includes(":")) {
      const pattern = route.replace(/:[\w]+/g, "[^/]+");
      if (new RegExp("^" + pattern + "$").test(t)) return route;
    }
  }

  // Prefix match
  for (const route of routeNodeIds.keys()) {
    if (route !== "/" && t.startsWith(route + "/")) return route;
  }

  return null;
}
