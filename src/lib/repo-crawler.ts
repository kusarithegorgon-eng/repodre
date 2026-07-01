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
}

export type EdgeKind = "navigation" | "action" | "success" | "failure";

export interface CrawlerEdge {
  id: string;
  from: string;
  to: string;
  kind: EdgeKind;
  label?: string;
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
}

/**
 * Scan a list of file paths and detect all route-bearing files.
 *
 * Recognized patterns:
 *   - Next.js App Router:  app/page.tsx, app/page.jsx, app/page.ts, app/page.js
 *   - Next.js Pages Router: pages/tsx, pages/jsx, pages/ts, pages/js
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
      const route = normalizeRoute(m[1]);
      if (!seen.has(route)) {
        seen.add(route);
        routes.push({ route, file: p, pattern: "app-router" });
      }
      continue;
    }

    // app/page.tsx → root "/"
    if (/(?:^|\/)app\/page\.(tsx|ts|js|jsx)$/.test(p)) {
      if (!seen.has("/")) {
        seen.add("/");
        routes.push({ route: "/", file: p, pattern: "app-router" });
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
      const route = normalizeRoute(seg);
      if (!seen.has(route)) {
        seen.add(route);
        routes.push({ route, file: p, pattern: "pages-router" });
      }
      continue;
    }

    // ── Vite/CRA entry: src/index.js or src/index.jsx ──────────────────
    if (/(?:^|\/)src\/index\.(js|jsx)$/.test(p)) {
      if (!seen.has("/")) {
        seen.add("/");
        routes.push({ route: "/", file: p, pattern: "vite-index" });
      }
      continue;
    }

    // ── Generic index.js/index.jsx in route-like directories ────────────
    // Only match if the directory path looks like a route segment
    // (not node_modules, not config dirs, not lib/utils)
    m = p.match(/(.+)\/index\.(js|jsx)$/);
    if (m) {
      const dir = m[1];
      if (isRouteLikeDirectory(dir)) {
        const route = normalizeRoute(dir);
        if (!seen.has(route)) {
          seen.add(route);
          routes.push({ route, file: p, pattern: "vite-index" });
        }
      }
    }
  }

  return routes.sort((a, b) => a.route.localeCompare(b.route));
}

/**
 * Convert a file path segment into a route path.
 *   "billing/history"    → "/billing/history"
 *   "auth/login"          → "/auth/login"
 *   "[id]"                → "/:param"
 *   "(auth)/login"        → "/login"
 *   "index"               → "/"
 */
function normalizeRoute(seg: string): string {
  if (seg === "index" || seg === "") return "/";
  let s = seg.replace(/\/index$/, "");
  // Dynamic segments: [id] → :param, [[...slug]] → :param
  s = s.replace(/\[\[?[\w.]+\]?\]/g, ":param");
  // Route groups: (auth) → removed
  s = s.replace(/\(([^)]+)\)/g, "");
  if (!s.startsWith("/")) s = "/" + s;
  s = s.replace(/\/+/g, "/");
  if (s.length > 1 && s.endsWith("/")) s = s.slice(0, -1);
  return s || "/";
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
  const routeNodeIds = new Map<string, string>(); // route → node id
  const pageFileToNodeId = new Map<string, string>(); // file path → page node id

  // ── 1. ROUTE CRAWL: instantiate Page View Nodes ─────────────────────
  const routes = crawlRoutes(filePaths);

  for (const r of routes) {
    const id = nextNodeId("page");
    routeNodeIds.set(r.route, id);
    pageFileToNodeId.set(r.file, id);

    nodes.push({
      id,
      type: "page",
      label: r.route,
      sub: r.pattern === "app-router" ? "App Router" : r.pattern === "pages-router" ? "Pages Router" : "Entry",
      shape: "rectangle",
      accent: "blue",
      sourcePath: r.file,
      route: r.route,
    });
  }

  // ── 2. INTERACTION EXTRACTION: wires & action nodes ──────────────────
  for (const r of routes) {
    const source = fileContents.get(r.file);
    if (!source) continue;

    const sourcePageId = pageFileToNodeId.get(r.file);
    if (!sourcePageId) continue;

    const interactions = extractInteractions(source);

    for (const interaction of interactions) {
      const target = interaction.target;

      // Check if the target matches a known route
      const targetRoute = resolveTargetRoute(target, routeNodeIds);
      const targetPageId = targetRoute ? routeNodeIds.get(targetRoute) : undefined;

      if (targetPageId && targetPageId !== sourcePageId) {
        // ── Check for validation gates between source and target ──────
        const validations = detectValidationGates(source);
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

          // Source page → validation diamond
          edges.push({
            id: nextEdgeId(),
            from: sourcePageId,
            to: valId,
            kind: "action",
            label: interaction.kind === "link" ? "Link" : interaction.kind === "router-push" ? "Redirect" : "Submit",
          });

          // Validation → target page (Success Path)
          edges.push({
            id: nextEdgeId(),
            from: valId,
            to: targetPageId,
            kind: "success",
            label: "Success Path",
          });

          // Validation → error/failure node (Failure Path)
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
          // ── Direct edge: source page → target page ──────────────────
          // If it's an onClick/onSubmit, insert an Action Node
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

            // Source page → action node
            edges.push({
              id: nextEdgeId(),
              from: sourcePageId,
              to: actionId,
              kind: "action",
              label: interaction.kind === "on-click" ? "onClick" : "onSubmit",
            });

            // Action node → target page
            edges.push({
              id: nextEdgeId(),
              from: actionId,
              to: targetPageId,
              kind: "navigation",
              label: "Navigate",
            });
          } else {
            // Direct navigation edge (Link or router.push)
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
        // Interaction doesn't target a known route — still create an Action Node
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
 * route in the project. Handles:
 *   - Exact match: "/billing" matches "/billing"
 *   - Dynamic segments: "/users/123" matches "/users/:param"
 *   - Relative paths: "./billing" → "/billing"
 */
function resolveTargetRoute(target: string, routeNodeIds: Map<string, string>): string | null {
  // Normalize the target
  let t = target.trim();

  // Remove query strings and fragments
  t = t.replace(/[?#].*$/, "");

  // Resolve relative paths
  if (t.startsWith("./")) t = "/" + t.slice(2);
  if (t.startsWith("../")) t = "/" + t.slice(3);

  // Ensure leading slash
  if (!t.startsWith("/")) t = "/" + t;

  // Exact match
  if (routeNodeIds.has(t)) return t;

  // Try matching dynamic segments: /users/123 → /users/:param
  for (const route of routeNodeIds.keys()) {
    if (route.includes(":param")) {
      const pattern = route.replace(":param", "[^/]+");
      if (new RegExp(`^${pattern}$`).test(t)) return route;
    }
  }

  // Try prefix match: /billing/history matches /billing
  for (const route of routeNodeIds.keys()) {
    if (route !== "/" && t.startsWith(route + "/")) return route;
  }

  return null;
}
