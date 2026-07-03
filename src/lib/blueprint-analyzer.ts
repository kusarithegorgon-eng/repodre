/**
 * Blueprint Analyzer — Automated App-Mapping Engine
 *
 * Interprets parsed source modules into an end-to-end application lifecycle
 * mapping of user-facing routes, validation checks, API controllers, and
 * database tables.
 *
 * Detection pipeline:
 *   1. ROUTE SCREEN CAPTURE — scans for Next.js App Router / Pages Router /
 *      SPA router configs and emits a View node per distinct user-facing route.
 *   2. FRONTEND VALIDATION CAPTURE — regex-scans page/form component source
 *      for Zod schemas, Yup validators, and ad-hoc `if (!x)` guards, emitting
 *      a Diamond validation node downstream of the owning View, with branch
 *      lines for Success / Failure.
 *   3. FRONTEND→BACKEND API HOOKS — traces fetch/axios/server-action calls
 *      from a View (or its validation Success branch) into the matching
 *      backend API route controller, then scans those controllers for DB
 *      queries (Supabase / Prisma / Mongoose) and links them to a DB node.
 *
 * The output is a flat list of BlueprintNode / BlueprintEdge records that
 * the layout engine (system-blueprint.ts) positions left-to-right.
 */

import type { ParsedModule } from "./ast-parser";
import type { Shape } from "./canvas-geometry";

export type BlueprintAccent = "green" | "purple" | "teal" | "blue" | "orange" | "red";

export type BlueprintNodeType =
  | "view" // user-facing route
  | "validation" // form/validation check
  | "controller" // backend API route controller
  | "database" // database table / schema
  | "error"; // error/return-to-page terminal

export interface BlueprintNode {
  id: string;
  type: BlueprintNodeType;
  label: string;
  sub: string;
  shape: Shape;
  accent: BlueprintAccent;
  /** stable key used to dedupe + link across passes */
  key: string;
  /** source path that produced this node */
  sourcePath?: string;
  /** line number in the source where the construct was detected */
  line?: number;
}

export interface BlueprintEdge {
  id: string;
  from: string; // node key
  to: string; // node key
  /** semantic label rendered on the connector: "Success", "Failure", etc. */
  label?: string;
}

export interface Blueprint {
  nodes: BlueprintNode[];
  edges: BlueprintEdge[];
  stats: {
    routes: number;
    validations: number;
    controllers: number;
    databases: number;
  };
}

// ─── ID generation (deterministic per analyzer run) ─────────────────────────

let nodeCounter = 0;
let edgeCounter = 0;

function nextNodeId(): string {
  return `bp_n${++nodeCounter}`;
}
function nextEdgeId(): string {
  return `bp_e${++edgeCounter}`;
}

function resetCounters() {
  nodeCounter = 0;
  edgeCounter = 0;
}

// ─── Route detection ───────────────────────────────────────────────────────

export interface DetectedRoute {
  /** stable key: the route path, e.g. "/login" */
  key: string;
  /** human label, e.g. "/login" */
  label: string;
  /** source file that defines the route */
  path: string;
  /** router flavour that produced this route */
  router: "app-router" | "pages-router" | "spa";
  /** line number of the route definition (1-based) */
  line?: number;
}

/**
 * Detect user-facing routes from the file tree.
 *
 *   Next.js App Router  -> app/.../page.tsx (or .js/.jsx)
 *   Next.js Pages Router -> pages/....{tsx,js,jsx} (excluding _app, _document, api)
 *   SPA router configs   -> heuristic scan of source for Route path / path literals
 */
export function detectRoutes(modules: ParsedModule[]): DetectedRoute[] {
  const routes: DetectedRoute[] = [];
  const seen = new Set<string>();

  for (const mod of modules) {
    const p = mod.path;

    // ── Next.js App Router: app/**/page.{tsx,ts,js,jsx} ─────────────────
    if (p.includes("/app/") || p.startsWith("app/")) {
      const match = p.match(/(?:^|\/)app\/(.+)\/page\.(tsx|ts|js|jsx)$/);
      if (match) {
        const seg = match[1];
        const routePath = normalizeRoutePath(seg);
        if (!seen.has(routePath)) {
          seen.add(routePath);
          routes.push({
            key: routePath,
            label: routePath,
            path: p,
            router: "app-router",
            line: 1,
          });
        }
        continue;
      }
      // app/page.tsx → root "/"
      if (/(?:^|\/)app\/page\.(tsx|ts|js|jsx)$/.test(p)) {
        if (!seen.has("/")) {
          seen.add("/");
          routes.push({ key: "/", label: "/", path: p, router: "app-router", line: 1 });
        }
        continue;
      }
    }

    // ── Next.js Pages Router: pages/**/*.{tsx,js,jsx} ───────────────────
    if (p.includes("/pages/") || p.startsWith("pages/")) {
      const match = p.match(/(?:^|\/)pages\/(.+)\.(tsx|ts|js|jsx)$/);
      if (match) {
        const seg = match[1];
        // skip special files and API routes
        if (seg.startsWith("api/") || seg.startsWith("_")) continue;
        if (["_app", "_document", "_error", "404", "500"].includes(seg)) continue;
        const routePath = normalizeRoutePath(seg);
        if (!seen.has(routePath)) {
          seen.add(routePath);
          routes.push({
            key: routePath,
            label: routePath,
            path: p,
            router: "pages-router",
            line: 1,
          });
        }
        continue;
      }
    }
  }

  // ── SPA router configs: scan source for path literals ─────────────────
  for (const mod of modules) {
    if (routes.length > 0 && /router|routes/i.test(mod.path)) {
      // already have routes from file-based routing; SPA scan is a fallback
    }
    const spaMatches = extractSpaRoutes(mod.source, mod.path);
    for (const r of spaMatches) {
      if (!seen.has(r.key)) {
        seen.add(r.key);
        routes.push({ ...r, router: "spa" });
      }
    }
  }

  return routes.sort((a, b) => a.label.localeCompare(b.label));
}

/** Convert a file segment like "auth/login" or "[id]" into a route path. */
function normalizeRoutePath(seg: string): string {
  if (seg === "index") return "/";
  let s = seg.replace(/\/index$/, "");
  s = s.replace(/\[\[?[\w]+\]?\]/g, ":param"); // [id] / [[...slug]]
  s = s.replace(/\(([^)]+)\)/g, ""); // route groups (auth)
  if (!s.startsWith("/")) s = "/" + s;
  s = s.replace(/\/+/g, "/");
  if (s.length > 1 && s.endsWith("/")) s = s.slice(0, -1);
  return s || "/";
}

/** Heuristic: pull `<Route path="/x">` or `path: "/x"` literals from source. */
function extractSpaRoutes(
  source: string,
  path: string
): DetectedRoute[] {
  const out: DetectedRoute[] = [];
  const seen = new Set<string>();

  // React Router <Route path="/foo" ...>
  const routeTagRe = /<Route[^>]*\bpath\s*=\s*["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = routeTagRe.exec(source)) !== null) {
    const r = m[1];
    if (r === "*" || r === "/" || seen.has(r)) continue;
    seen.add(r);
    out.push({ key: r, label: r, path, router: "spa" });
  }

  // Object config: { path: "/foo", ... }
  const pathPropRe = /path\s*:\s*["']([^"']+)["']/g;
  while ((m = pathPropRe.exec(source)) !== null) {
    const r = m[1];
    if (r === "*" || r === "/" || seen.has(r)) continue;
    // only accept if it looks like a route (starts with / and has no extension)
    if (!r.startsWith("/") || /\.[a-z0-9]+$/i.test(r)) continue;
    seen.add(r);
    out.push({ key: r, label: r, path, router: "spa" });
  }

  return out;
}

// ─── Validation detection ──────────────────────────────────────────────────

export interface DetectedValidation {
  /** stable key */
  key: string;
  /** label shown on the diamond, e.g. "validateLogin" */
  label: string;
  /** source file containing the validation */
  path: string;
  /** line number of the detected construct */
  line?: number;
  /** which validation flavour was detected */
  kind: "zod" | "yup" | "custom";
}

/**
 * Detect form/validation logic in a page or component source.
 *
 *   Zod   → z.object( ... ), z.string(), z.email(), .parse( / .safeParse(
 *   Yup   -> yup.object(), yup.string(), .validate(
 *   Custom→ if (!email), if (!password), if (errors.), throw new Error
 */
export function detectValidation(mod: ParsedModule): DetectedValidation | null {
  const src = mod.source;
  if (!src) return null;

  const hasZod =
    /z\.\s*object\s*\(/.test(src) ||
    /z\.\s*(string|number|email|password|boolean|date|enum|array|object)\s*\(/.test(src) ||
    /\.safeParse\s*\(/.test(src) ||
    /\.parse\s*\(/.test(src);

  const hasYup =
    /yup\.\s*(object|string|number|boolean|date|array)\s*\(/.test(src) ||
    /\.validate\s*\(/.test(src) ||
    /\.validateSync\s*\(/.test(src);

  const hasCustom =
    /if\s*\(\s*!/.test(src) ||
    /if\s*\(\s*[\w.]+\s*===?\s*['"]?['"]?\s*\)/.test(src) === false &&
      /throw\s+new\s+Error\s*\(/.test(src);

  if (!hasZod && !hasYup && !hasCustom) return null;

  const kind: DetectedValidation["kind"] = hasZod ? "zod" : hasYup ? "yup" : "custom";

  // Derive a label from the file name
  const base = mod.path.split("/").pop()?.replace(/\.(tsx|ts|js|jsx)$/, "") || "validate";
  const label = `validate${capitalize(base)}`;

  // Find the first line of the detected construct for jump-to-source
  let line: number | undefined;
  const re = hasZod
    ? /z\.\s*object\s*\(/
    : hasYup
    ? /yup\.\s*object\s*\(/
    : /if\s*\(\s*!/;
  const m = re.exec(src);
  if (m) line = src.substring(0, m.index).split("\n").length;

  return {
    key: `val:${mod.path}`,
    label,
    path: mod.path,
    line,
    kind,
  };
}

// ─── API hook detection (frontend → backend) ────────────────────────────────

export interface DetectedApiCall {
  /** the URL/path called, e.g. "/api/auth" */
  endpoint: string;
  /** HTTP method if detectable */
  method?: string;
  /** source file that made the call */
  path: string;
  /** line number */
  line?: number;
  /** whether this looks like a Next.js Server Action */
  isServerAction?: boolean;
}

/**
 * Detect client-side network calls in a module's source.
 *
 *   fetch("/api/auth", { method: "POST" })
 *   axios.post("/api/auth")
 *   useSWR("/api/profile")
 *   "use server" → server action
 */
export function detectApiCalls(mod: ParsedModule): DetectedApiCall[] {
  const src = mod.source;
  if (!src) return [];
  const out: DetectedApiCall[] = [];
  const seen = new Set<string>();

  const add = (endpoint: string, method?: string, line?: number, isServerAction?: boolean) => {
    const k = `${method ?? "GET"} ${endpoint}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ endpoint, method, path: mod.path, line, isServerAction });
  };

  // fetch("…", { method: "POST" })
  const fetchRe = /fetch\s*\(\s*['"`]([^'"`]+)['"`][^)]*\)/g;
  let m: RegExpExecArray | null;
  while ((m = fetchRe.exec(src)) !== null) {
    const url = m[1];
    if (!isLocalEndpoint(url)) continue;
    const methodMatch = src.slice(m.index, m.index + 200).match(/method\s*:\s*['"](\w+)['"]/);
    const line = src.substring(0, m.index).split("\n").length;
    add(url, methodMatch?.[1]?.toUpperCase(), line);
  }

  // axios.get/post/put/delete("…")
  const axiosRe = /axios\s*\.\s*(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]/g;
  while ((m = axiosRe.exec(src)) !== null) {
    const url = m[2];
    if (!isLocalEndpoint(url)) continue;
    const line = src.substring(0, m.index).split("\n").length;
    add(url, m[1].toUpperCase(), line);
  }

  // useSWR("/api/…") / useFetch("/api/…")
  const swrRe = /use(?:SWR|Fetch)\s*\(\s*['"`]([^'"`]+)['"`]/g;
  while ((m = swrRe.exec(src)) !== null) {
    const url = m[1];
    if (!isLocalEndpoint(url)) continue;
    const line = src.substring(0, m.index).split("\n").length;
    add(url, "GET", line);
  }

  // Server Actions: "use server" + exported async function
  if (/"use server"/.test(src)) {
    const saRe = /export\s+async\s+function\s+(\w+)\s*\(/g;
    while ((m = saRe.exec(src)) !== null) {
      const line = src.substring(0, m.index).split("\n").length;
      add(`action:${m[1]}`, "POST", line, true);
    }
  }

  return out;
}

function isLocalEndpoint(url: string): boolean {
  return url.startsWith("/") || url.startsWith("./") || url.startsWith("../");
}

// ─── Backend API controller detection ──────────────────────────────────────

export interface DetectedController {
  /** stable key: the route path, e.g. "/api/auth" */
  key: string;
  /** label, e.g. "/api/auth" */
  label: string;
  /** source file */
  path: string;
  /** HTTP methods exported (App Router: GET/POST/...) */
  methods: string[];
  /** line number of the first handler */
  line?: number;
}

/**
 * Detect backend API route controllers.
 *
 *   Next.js App Router  -> app/api/.../route.ts exporting GET/POST/...
 *   Next.js Pages Router -> pages/api/....ts exporting default function handler
 */
export function detectControllers(modules: ParsedModule[]): DetectedController[] {
  const out: DetectedController[] = [];
  const seen = new Set<string>();

  for (const mod of modules) {
    const p = mod.path;
    const src = mod.source;

    // App Router: app/api/.../route.ts
    if (/(?:^|\/)app\/(.+)\/route\.(ts|tsx|js|jsx)$/.test(p)) {
      const m = p.match(/(?:^|\/)app\/(.+)\/route\.(ts|tsx|js|jsx)$/)!;
      const routePath = normalizeApiPath(m[1]);
      const methods = extractExportedHttpMethods(src);
      if (methods.length === 0) continue;
      if (!seen.has(routePath)) {
        seen.add(routePath);
        const line = src.match(/export\s+(async\s+)?function\s+(GET|POST|PUT|DELETE|PATCH)/)?.index;
        out.push({
          key: routePath,
          label: routePath,
          path: p,
          methods,
          line: line != null ? src.substring(0, line).split("\n").length : undefined,
        });
      }
      continue;
    }

    // Pages Router: pages/api/...
    if (/(?:^|\/)pages\/(.+)\.(ts|tsx|js|jsx)$/.test(p)) {
      const m = p.match(/(?:^|\/)pages\/(.+)\.(ts|tsx|js|jsx)$/)!;
      const seg = m[1];
      if (!seg.startsWith("api/")) continue;
      const routePath = normalizeApiPath(seg.replace(/^api\//, "/api/"));
      if (!seen.has(routePath)) {
        seen.add(routePath);
        out.push({
          key: routePath,
          label: routePath,
          path: p,
          methods: ["HANDLER"],
          line: 1,
        });
      }
      continue;
    }
  }

  return out.sort((a, b) => a.label.localeCompare(b.label));
}

function normalizeApiPath(seg: string): string {
  let s = seg.replace(/\[\[?[\w]+\]?\]/g, ":param");
  s = s.replace(/\(([^)]+)\)/g, "");
  if (!s.startsWith("/")) s = "/" + s;
  s = s.replace(/\/+/g, "/");
  if (s.length > 1 && s.endsWith("/")) s = s.slice(0, -1);
  return s || "/api";
}

function extractExportedHttpTypes(src: string): string[] {
  const methods: string[] = [];
  for (const verb of ["GET", "POST", "PUT", "DELETE", "PATCH"]) {
    const re = new RegExp(`export\\s+(?:async\\s+)?function\\s+${verb}\\b`);
    if (re.test(src)) methods.push(verb);
  }
  return methods;
}

// alias used internally
const extractExportedHttpMethods = extractExportedHttpTypes;

// ─── Database query detection ───────────────────────────────────────────────

export interface DetectedDatabase {
  /** stable key: the table name, e.g. "profiles" */
  key: string;
  /** label, e.g. "profiles" */
  label: string;
  /** source file that references the table */
  path: string;
  /** ORM/client flavour */
  client: "supabase" | "prisma" | "mongoose" | "raw-sql";
  /** line number of the first reference */
  line?: number;
}

/**
 * Detect database table references in a module's source.
 *
 *   Supabase → supabase.from("profiles") / .from('profiles')
 *   Prisma   → prisma.user.findMany() / prisma.post.create()
 *   Mongoose → Model.find() / User.findOne()
 *   Raw SQL  → CREATE TABLE / FROM "table"
 */
export function detectDatabases(mod: ParsedModule): DetectedDatabase[] {
  const src = mod.source;
  if (!src) return [];
  const out: DetectedDatabase[] = [];
  const seen = new Set<string>();

  const add = (table: string, client: DetectedDatabase["client"], line?: number) => {
    const key = `${client}:${table}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ key, label: table, path: mod.path, client, line });
  };

  // Supabase: .from("table") / .from('table')
  const sbRe = /\.from\s*\(\s*['"`]([a-zA-Z_][\w]*)['"`]/g;
  let m: RegExpExecArray | null;
  while ((m = sbRe.exec(src)) !== null) {
    const line = src.substring(0, m.index).split("\n").length;
    add(m[1], "supabase", line);
  }

  // Prisma: prisma.<model>.<method>(...)
  const prismaRe = /prisma\.([a-zA-Z_]\w*)\.(findMany|findUnique|findFirst|create|update|delete|upsert|count|aggregate)\s*\(/g;
  while ((m = prismaRe.exec(src)) !== null) {
    const line = src.substring(0, m.index).split("\n").length;
    add(m[1], "prisma", line);
  }

  // Mongoose: <Model>.find( / .findOne( / .create(
  // Heuristic: capitalized identifier followed by model methods
  const mongooseRe = /\b([A-Z]\w*)\.(find|findOne|findById|create|updateOne|deleteOne|save)\s*\(/g;
  while ((m = mongooseRe.exec(src)) !== null) {
    const name = m[1];
    // skip common false positives (React components, Math, Object, etc.)
    if (["Math", "Object", "Array", "JSON", "Promise", "Date", "Error", "Response", "Request"].includes(name)) continue;
    const line = src.substring(0, m.index).split("\n").length;
    add(name.toLowerCase(), "mongoose", line);
  }

  // Raw SQL: CREATE TABLE "name" / INSERT INTO "name" / DELETE FROM "name"
  // (case-sensitive — uppercase SQL keywords only — to avoid matching JS
  //  `import ... from "mod"` which uses lowercase `from`.)
  const sqlRe = /(?:CREATE\s+TABLE|INSERT\s+INTO|DELETE\s+FROM)\s+["`]?([a-zA-Z_][\w]*)["`]?/g;
  while ((m = sqlRe.exec(src)) !== null) {
    const line = src.substring(0, m.index).split("\n").length;
    add(m[1], "raw-sql", line);
  }

  return out;
}

// ─── Top-level analyzer: assemble the full blueprint ───────────────────────

/**
 * Infer foreign key edges between database tables based on naming conventions.
 *
 * Patterns detected:
 *   - Singular table referenced by plural: "profiles.user_id" → "users"
 *   - Common suffix patterns: *_id, *_ref, *_fk
 *   - Same-prefix tables: "order_items" might reference "orders"
 */
function inferForeignKeyEdges(
  dbKeys: Set<string>,
  nodeByKey: Map<string, string>,
  edges: BlueprintEdge[]
): void {
  // Extract table names (last part after colon if client-prefixed)
  const tableNames = new Map<string, string>(); // table name → full key
  for (const key of dbKeys) {
    const tableName = key.includes(":") ? key.split(":")[1] : key;
    tableNames.set(tableName, key);
  }

  // Build singular→plural mapping
  const singularToPlural = new Map<string, string>();
  for (const name of tableNames.keys()) {
    // Simple pluralization heuristics
    if (name.endsWith("s")) {
      singularToPlural.set(name.slice(0, -1), name); // users → user
    }
    if (name.endsWith("ies")) {
      singularToPlural.set(name.slice(0, -3) + "y", name); // categories → category
    }
    if (name.endsWith("es")) {
      singularToPlural.set(name.slice(0, -2), name); // statuses → status
    }
  }

  // For each table, infer FK relationships by scanning for references
  for (const [table, key] of tableNames) {
    // Check if table name suggests it references another table
    // e.g., "user_profiles" might reference "users"
    const parts = table.split("_");
    for (let i = 1; i <= parts.length; i++) {
      const prefix = parts.slice(0, -i).join("_");
      const suffix = parts.slice(-i).join("_");

      // Check for singular reference
      const pluralRef = singularToPlural.get(suffix) || (suffix.endsWith("s") ? suffix : `${suffix}s`);
      if (tableNames.has(pluralRef) && pluralRef !== table) {
        const from = nodeByKey.get(key);
        const to = nodeByKey.get(tableNames.get(pluralRef)!);
        if (from && to && from !== to) {
          const exists = edges.some((e) => e.from === from && e.to === to);
          if (!exists) {
            edges.push({
              id: nextEdgeId(),
              from,
              to,
              label: "FK",
            });
          }
        }
      }
    }

    // Also check if table contains common FK suffix patterns in source
    // This is a naming-based heuristic
    if (table.includes("_")) {
      const potentialRefs = table.match(/(\w+)_id/g) || [];
      for (const ref of potentialRefs) {
        const refTable = ref.replace("_id", "");
        const pluralRef = singularToPlural.get(refTable) || `${refTable}s`;
        if (tableNames.has(pluralRef) && pluralRef !== table) {
          const from = nodeByKey.get(key);
          const to = nodeByKey.get(tableNames.get(pluralRef)!);
          if (from && to && from !== to) {
            const exists = edges.some((e) => e.from === from && e.to === to);
            if (!exists) {
              edges.push({
                id: nextEdgeId(),
                from,
                to,
                label: "FK",
              });
            }
          }
        }
      }
    }
  }
}

/**
 * Run the full app-mapping pipeline over a set of parsed modules and produce
 * a Blueprint of nodes + edges ready for the layout engine.
 */
export function analyzeBlueprint(modules: ParsedModule[]): Blueprint {
  resetCounters();

  const nodes: BlueprintNode[] = [];
  const edges: BlueprintEdge[] = [];
  const nodeByKey = new Map<string, string>(); // blueprint key → node id

  const ensureNode = (
    key: string,
    type: BlueprintNodeType,
    label: string,
    sub: string,
    shape: Shape,
    accent: BlueprintAccent,
    sourcePath?: string,
    line?: number
  ): string => {
    const existing = nodeByKey.get(key);
    if (existing) return existing;
    const id = nextNodeId();
    nodes.push({ id, type, label, sub, shape, accent, key, sourcePath, line });
    nodeByKey.set(key, id);
    return id;
  };

  const link = (fromKey: string, toKey: string, label?: string) => {
    const from = nodeByKey.get(fromKey);
    const to = nodeByKey.get(toKey);
    if (!from || !to || from === to) return;
    // dedupe by (from,to,label)
    const exists = edges.some(
      (e) => e.from === from && e.to === to && e.label === label
    );
    if (exists) return;
    edges.push({ id: nextEdgeId(), from, to, label });
  };

  // ── Pass 1: routes → View nodes ──────────────────────────────────────
  const routes = detectRoutes(modules);
  for (const r of routes) {
    ensureNode(
      r.key,
      "view",
      r.label,
      r.router === "app-router"
        ? "App Router"
        : r.router === "pages-router"
        ? "Pages Router"
        : "SPA Route",
      "pill",
      "green",
      r.path,
      r.line
    );
  }

  // ── Pass 2: controllers → Controller nodes ───────────────────────────
  const controllers = detectControllers(modules);
  for (const c of controllers) {
    ensureNode(
      c.key,
      "controller",
      c.label,
      c.methods.join("/"),
      "rectangle",
      "teal",
      c.path,
      c.line
    );
  }

  // ── Pass 3: per-module validation + API hooks + DB queries ───────────
  // Map route path → module path so we can attach validations to the right view
  const routeByPath = new Map<string, DetectedRoute>();
  for (const r of routes) routeByPath.set(r.path, r);

  // Map controller key → controller (for linking API calls)
  const controllerByKey = new Map<string, DetectedController>();
  for (const c of controllers) controllerByKey.set(c.key, c);

  // Map controller source path → controller (for linking DB queries found in controllers)
  const controllerByPath = new Map<string, DetectedController>();
  for (const c of controllers) controllerByPath.set(c.path, c);

  // Track which validations feed which controllers (for Success branch)
  // and which views own which validations.
  const viewToValidation = new Map<string, string>(); // viewKey → validationKey
  const validationToView = new Map<string, string>(); // validationKey → viewKey

  // Track all detected database tables for FK inference
  const allDbKeys = new Set<string>();

  for (const mod of modules) {
    const route = routeByPath.get(mod.path);

    // ── Validation detection (only on route modules) ─────────────────
    let validationKey: string | null = null;
    if (route) {
      const v = detectValidation(mod);
      if (v) {
        validationKey = v.key;
        ensureNode(
          v.key,
          "validation",
          v.label,
          v.kind === "zod"
            ? "Zod Schema"
            : v.kind === "yup"
            ? "Yup Schema"
            : "Custom Check",
          "diamond",
          "purple",
          v.path,
          v.line
        );
        // View → Validation
        link(route.key, v.key);
        viewToValidation.set(route.key, v.key);
        validationToView.set(v.key, route.key);
      }
    }

    // ── API calls from this module ───────────────────────────────────
    const apiCalls = detectApiCalls(mod);
    for (const call of apiCalls) {
      // Resolve the endpoint to a controller key
      const ctrlKey = resolveControllerKey(call.endpoint, controllerByKey);
      if (!ctrlKey) continue;

      if (validationKey) {
        // Validation Success → Controller
        link(validationKey, ctrlKey, "Success");
      } else if (route) {
        // No validation: View → Controller directly
        link(route.key, ctrlKey);
      }

      // Failure branch: Validation → Error (back to view)
      if (validationKey && route) {
        const errKey = `err:${route.key}`;
        ensureNode(
          errKey,
          "error",
          "Show error",
          "Validation failure",
          "triangle",
          "red",
          route.path
        );
        link(validationKey, errKey, "Failure");
      }
    }

    // ── Database queries ──────────────────────────────────────────────
    const dbs = detectDatabases(mod);
    for (const db of dbs) {
      ensureNode(
        db.key,
        "database",
        db.label,
        db.client === "supabase"
          ? "Supabase Table"
          : db.client === "prisma"
          ? "Prisma Model"
          : db.client === "mongoose"
          ? "Mongoose Model"
          : "SQL Table",
        "cylinder",
        "blue",
        db.path,
        db.line
      );
      allDbKeys.add(db.key);

      // If this DB query is inside a controller, link Controller → DB
      const ctrl = controllerByPath.get(mod.path);
      if (ctrl) {
        link(ctrl.key, db.key);
      } else if (route) {
        // Direct client-side DB call (rare but possible) — link from view
        link(route.key, db.key);
      }
    }
  }

  // ── Pass 4: Infer FK edges between database tables ───────────────────────────
  // When only database nodes exist (no routes/controllers), infer FK relationships
  // based on naming conventions: "user_id" → "users", "profile_id" → "profiles"
  if (allDbKeys.size > 1) {
    inferForeignKeyEdges(allDbKeys, nodeByKey, edges);
  }

  return {
    nodes,
    edges,
    stats: {
      routes: routes.length,
      validations: nodes.filter((n) => n.type === "validation").length,
      controllers: controllers.length,
      databases: nodes.filter((n) => n.type === "database").length,
    },
  };
}

/**
 * Resolve a frontend API call endpoint to a controller key.
 * Handles trailing slashes and dynamic segments.
 */
function resolveControllerKey(
  endpoint: string,
  controllers: Map<string, DetectedController>
): string | null {
  if (controllers.has(endpoint)) return endpoint;
  // try normalizing
  const normalized = endpoint.replace(/\/+$/, "") || "/";
  if (controllers.has(normalized)) return normalized;
  // try matching a dynamic controller by prefix
  for (const key of controllers.keys()) {
    if (key.replace(/:param/g, "[^/]+") === endpoint) return key;
  }
  return null;
}

// ─── helpers ───────────────────────────────────────────────────────────────

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
