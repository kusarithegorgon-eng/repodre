/**
 * Deterministic 70% Automation Parser
 *
 * Explicit string-signature-based extraction for a reliable architectural baseline.
 * Uses direct regex matching on file paths and source content to instantiate
 * canvas nodes with predictable, deterministic results.
 *
 * Detection Pipeline:
 *   1. FILE ROUTE MAPPING: Parse Next.js/framework layouts
 *   2. VALIDATION FOOTPRINTS: Scan for z.object, yup, .validate patterns
 *   3. SQL DDL EXTRACTION: Extract CREATE TABLE with FK relationships
 */

import type { Shape } from "./canvas-geometry";

export type DeterministicAccent = "green" | "purple" | "teal" | "blue" | "orange" | "red";

export interface ParsedRouteNode {
  id: string;
  type: "view";
  label: string;
  sub: string;
  shape: Shape;
  accent: DeterministicAccent;
  filePath: string;
  routePath: string;
  line?: number;
}

export interface ParsedValidationNode {
  id: string;
  type: "validation";
  label: string;
  sub: string;
  shape: Shape;
  accent: DeterministicAccent;
  sourceKey: string; // The route or module this validates
  filePath: string;
  kind: "zod" | "yup" | "custom";
  line?: number;
}

export interface ParsedControllerNode {
  id: string;
  type: "controller";
  label: string;
  sub: string;
  shape: Shape;
  accent: DeterministicAccent;
  filePath: string;
  methods: string[];
  line?: number;
}

export interface ParsedColumn {
  name: string;
  type: string;
  isPk: boolean;
  isFk: boolean;
  isUnique: boolean;
  isNullable: boolean;
  referencesTable?: string;
  referencesColumn?: string;
}

export interface ParsedTableNode {
  id: string;
  type: "database";
  label: string;
  sub: string;
  shape: Shape;
  accent: DeterministicAccent;
  tableName: string;
  columns: ParsedColumn[];
  source?: string;
}

export interface ParsedEdge {
  id: string;
  from: string;
  to: string;
  label?: string;
  cardinality?: "one-to-one" | "one-to-many";
  fromColumn?: string;
  toColumn?: string;
}

export interface DeterministicParseResult {
  routes: ParsedRouteNode[];
  validations: ParsedValidationNode[];
  controllers: ParsedControllerNode[];
  tables: ParsedTableNode[];
  edges: ParsedEdge[];
  stats: {
    routesDetected: number;
    validationsDetected: number;
    controllersDetected: number;
    tablesDetected: number;
    fkRelationships: number;
  };
}

let idCounter = 0;
const nextId = (prefix: string) => `${prefix}_${++idCounter}`;

export function resetCounters() {
  idCounter = 0;
}

// ─── 1. FILE ROUTE MAPPING ────────────────────────────────────────────────────

/**
 * Detect routes from file paths using explicit pattern matching.
 *
 * Rules:
 *   - app/&#42;&#42;/page.tsx → View node with route path from directory
 *   - app/page.tsx → Root "/" route
 *   - pages/&#42;&#42;.{tsx,js} → View node (Pages Router)
 */
export function parseRoutesFromFileTree(files: string[]): ParsedRouteNode[] {
  const routes: ParsedRouteNode[] = [];
  const seen = new Set<string>();

  for (const filePath of files) {
    // Skip non-page files
    if (!isPageFile(filePath)) continue;

    const routePath = extractRoutePath(filePath);
    if (!routePath || seen.has(routePath)) continue;

    seen.add(routePath);
    routes.push({
      id: nextId("route"),
      type: "view",
      label: routePath === "/" ? "/ (Home)" : routePath,
      sub: inferRouteSubtype(filePath),
      shape: "pill",
      accent: "green",
      filePath,
      routePath,
      line: 1,
    });
  }

  return routes.sort((a, b) => a.routePath.localeCompare(b.routePath));
}

function isPageFile(path: string): boolean {
  // App Router: app/**/page.tsx
  if (/(?:^|\/)app\/(?:.*\/)?page\.(tsx|ts|js|jsx)$/.test(path)) return true;

  // Pages Router: pages/**/*.{tsx,js,jsx} (excluding _app, _document, api, etc.)
  if (/(?:^|\/)pages\//.test(path)) {
    const seg = path.match(/(?:^|\/)pages\/(.+)\.(tsx|ts|js|jsx)$/);
    if (seg) {
      const route = seg[1];
      if (route.startsWith("api/") || route.startsWith("_")) return false;
      if (["_app", "_document", "_error", "404", "500"].includes(route)) return false;
      return true;
    }
  }

  return false;
}

function extractRoutePath(filePath: string): string | null {
  // App Router
  const appMatch = filePath.match(/(?:^|\/)app\/(.+)\/page\.(tsx|ts|js|jsx)$/);
  if (appMatch) {
    return normalizeRouteSegment(appMatch[1]);
  }

  // Root app page
  if (/(?:^|\/)app\/page\.(tsx|ts|js|jsx)$/.test(filePath)) {
    return "/";
  }

  // Pages Router
  const pagesMatch = filePath.match(/(?:^|\/)pages\/(.+)\.(tsx|ts|js|jsx)$/);
  if (pagesMatch) {
    return normalizeRouteSegment(pagesMatch[1]);
  }

  return null;
}

function normalizeRouteSegment(seg: string): string {
  if (seg === "index") return "/";

  // Handle dynamic segments [id] → :id
  let normalized = seg.replace(/\[\[?([\w]+)\]?\]/g, ":$1");

  // Remove route groups (auth)
  normalized = normalized.replace(/\([^)]+\)/g, "");

  // Remove /index suffix
  normalized = normalized.replace(/\/index$/, "");

  // Ensure leading slash
  if (!normalized.startsWith("/")) normalized = "/" + normalized;

  // Normalize multiple slashes
  normalized = normalized.replace(/\/+/g, "/");

  // Remove trailing slash
  if (normalized.length > 1 && normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }

  return normalized || "/";
}

function inferRouteSubtype(filePath: string): string {
  if (/(?:^|\/)app\//.test(filePath)) return "App Router";
  if (/(?:^|\/)pages\//.test(filePath)) return "Pages Router";
  return "View";
}

// ─── 2. VALIDATION FOOTPRINT DETECTION ─────────────────────────────────────────

export interface ValidationFootprint {
  kind: "zod" | "yup" | "custom";
  line: number;
  snippet: string;
}

/**
 * Scan source for validation patterns and inject validation nodes.
 *
 * Patterns:
 *   - z.object, z.string, z.email, .parse, .safeParse
 *   - yup.object, .validate, .validateSync
 *   - if (!xxx), throw new Error (custom guards)
 */
export function detectValidationFootprints(
  source: string,
  filePath: string,
  sourceKey: string
): ParsedValidationNode[] {
  const validations: ParsedValidationNode[] = [];

  // Zod detection
  const zodPatterns = [
    /z\s*\.\s*object\s*\(/g,
    /z\s*\.\s*(string|number|email|password|boolean|date|array)\s*\(/g,
    /\.safeParse\s*\(/g,
    /\.parse\s*\(/g,
  ];

  let hasZod = false;
  for (const pattern of zodPatterns) {
    if (pattern.test(source)) {
      hasZod = true;
      break;
    }
  }

  if (hasZod) {
    const line = findLineNumber(source, /z\s*\.\s*object\s*\(/);
    const baseName = filePath.split("/").pop()?.replace(/\.(tsx|ts|js|jsx)$/, "") || "form";
    validations.push({
      id: nextId("val"),
      type: "validation",
      label: `validate${capitalize(baseName)}`,
      sub: "Zod Schema",
      shape: "diamond",
      accent: "purple",
      sourceKey,
      filePath,
      kind: "zod",
      line,
    });
  }

  // Yup detection (only if no Zod)
  if (!hasZod) {
    const hasYup = /yup\s*\.\s*(object|string|number|boolean|array)\s*\(/.test(source) ||
                   /\.validate\s*\(/.test(source);

    if (hasYup) {
      const line = findLineNumber(source, /yup\s*\.\s*object\s*\(/);
      const baseName = filePath.split("/").pop()?.replace(/\.(tsx|ts|js|jsx)$/, "") || "form";
      validations.push({
        id: nextId("val"),
        type: "validation",
        label: `validate${capitalize(baseName)}`,
        sub: "Yup Schema",
        shape: "diamond",
        accent: "purple",
        sourceKey,
        filePath,
        kind: "yup",
        line,
      });
    }
  }

  // Custom validation detection (if (!xxx) guards)
  const hasCustomGuard = /if\s*\(\s*!/.test(source) && /throw\s+new\s+Error/.test(source);
  if (hasCustomGuard && validations.length === 0) {
    const line = findLineNumber(source, /if\s*\(\s*!/);
    const baseName = filePath.split("/").pop()?.replace(/\.(tsx|ts|js|jsx)$/, "") || "form";
    validations.push({
      id: nextId("val"),
      type: "validation",
      label: `validate${capitalize(baseName)}`,
      sub: "Custom Check",
      shape: "diamond",
      accent: "purple",
      sourceKey,
      filePath,
      kind: "custom",
      line,
    });
  }

  return validations;
}

// ─── 3. SQL DDL EXTRACTION ─────────────────────────────────────────────────────

/**
 * Extract CREATE TABLE statements with FK relationships.
 *
 * Regex Strategy:
 *   1. Match CREATE TABLE [name] ... blocks
 *   2. Extract column lines (name, type)
 *   3. Check for REFERENCES [table]([col])
 *   4. If UNIQUE → One-to-One (||), else → One-to-Many (1:N)
 */
export function parseDdlSchema(ddl: string): { tables: ParsedTableNode[]; edges: ParsedEdge[] } {
  const tables: ParsedTableNode[] = [];
  const edges: ParsedEdge[] = [];
  const tableIdMap = new Map<string, string>();

  // Strip comments
  const cleaned = ddl
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ")
    .replace(/#[^\n]*/g, " ");

  // Match CREATE TABLE blocks
  const tableRe = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["`]?(\w+)["`]?\s*\(([\s\S]*?)\);/gi;
  let tableMatch: RegExpExecArray | null;

  while ((tableMatch = tableRe.exec(cleaned)) !== null) {
    const tableName = tableMatch[1];
    const body = tableMatch[2];
    const columns = parseColumnBlock(body, tableName);

    const id = nextId("tbl");
    tableIdMap.set(tableName, id);

    tables.push({
      id,
      type: "database",
      label: tableName,
      sub: `${columns.length} columns`,
      shape: "cylinder",
      accent: "blue",
      tableName,
      columns,
      source: ddl.slice(tableMatch.index, tableMatch.index + tableMatch[0].length),
    });
  }

  // Extract FK relationships
  for (const table of tables) {
    for (const col of table.columns) {
      if (col.isFk && col.referencesTable && col.referencesColumn) {
        const toId = tableIdMap.get(col.referencesTable);
        if (toId) {
          edges.push({
            id: nextId("fk"),
            from: table.id,
            to: toId,
            cardinality: col.isUnique ? "one-to-one" : "one-to-many",
            fromColumn: col.name,
            toColumn: col.referencesColumn,
          });
        }
      }
    }
  }

  return { tables, edges };
}

function parseColumnBlock(body: string, _tableName: string): ParsedColumn[] {
  const columns: ParsedColumn[] = [];

  // Split on top-level commas (not inside parens)
  const parts: string[] = [];
  let depth = 0;
  let current = "";

  for (const ch of body) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current.trim());

  for (const part of parts) {
    // Skip table-level constraints
    if (/^(PRIMARY\s+KEY|FOREIGN\s+KEY|UNIQUE|CONSTRAINT|INDEX|KEY)/i.test(part)) continue;

    const col = parseColumnLine(part);
    if (col) columns.push(col);
  }

  return columns;
}

function parseColumnLine(line: string): ParsedColumn | null {
  // First token is column name
  const nameMatch = line.match(/^["`]?(\w+)["`]?\s+(.*)$/);
  if (!nameMatch) return null;

  const name = nameMatch[1];
  const rest = nameMatch[2];

  // Extract type (first word/phrase after name)
  const typeMatch = rest.match(/^(\w+(?:\s*\([^)]*\))?)/);
  const type = typeMatch ? normalizeType(typeMatch[1]) : "TEXT";

  const upperRest = rest.toUpperCase();

  const isPk = /\bPRIMARY\s+KEY\b/i.test(rest);
  const isFk = /\bREFERENCES\b/i.test(rest);
  const isUnique = /\bUNIQUE\b/i.test(rest);
  const notNull = /\bNOT\s+NULL\b/i.test(rest);
  const isNullable = !notNull && !isPk;

  let referencesTable: string | undefined;
  let referencesColumn: string | undefined;

  if (isFk) {
    const refMatch = rest.match(/REFERENCES\s+["`]?(\w+)["`]?\s*\(\s*["`]?(\w+)["`]?\s*\)/i);
    if (refMatch) {
      referencesTable = refMatch[1];
      referencesColumn = refMatch[2];
    }
  }

  return {
    name,
    type,
    isPk,
    isFk,
    isUnique,
    isNullable,
    referencesTable,
    referencesColumn,
  };
}

function normalizeType(raw: string): string {
  const t = raw.toUpperCase().replace(/\(.*\)$/, "");

  const intTypes = ["INT", "INTEGER", "BIGINT", "SMALLINT", "TINYINT", "SERIAL", "BIGSERIAL"];
  const textTypes = ["TEXT", "VARCHAR", "CHAR", "CHARACTER", "LONGTEXT", "MEDIUMTEXT", "TINYTEXT"];
  const numericTypes = ["DECIMAL", "NUMERIC", "FLOAT", "DOUBLE", "REAL"];
  const boolTypes = ["BOOLEAN", "BOOL"];
  const dateTypes = ["DATE", "TIME", "TIMESTAMP", "DATETIME", "TIMESTAMPTZ"];
  const jsonTypes = ["JSON", "JSONB"];
  const blobTypes = ["BLOB", "LONGBLOB", "MEDIUMBLOB", "TINYBLOB", "BYTEA"];
  const uuidTypes = ["UUID", "UNIQUEIDENTIFIER"];

  if (intTypes.some((x) => t.includes(x))) return "INTEGER";
  if (textTypes.some((x) => t.includes(x))) return "TEXT";
  if (numericTypes.some((x) => t.includes(x))) return "NUMERIC";
  if (boolTypes.some((x) => t.includes(x))) return "BOOLEAN";
  if (dateTypes.some((x) => t.includes(x))) return "TIMESTAMP";
  if (jsonTypes.some((x) => t.includes(x))) return "JSON";
  if (blobTypes.some((x) => t.includes(x))) return "BLOB";
  if (uuidTypes.some((x) => t.includes(x))) return "UUID";

  return t || "TEXT";
}

// ─── 4. API CONTROLLER DETECTION ──────────────────────────────────────────────

/**
 * Detect API route controllers from file paths.
 */
export function parseControllersFromFileTree(files: string[]): ParsedControllerNode[] {
  const controllers: ParsedControllerNode[] = [];
  const seen = new Set<string>();

  for (const filePath of files) {
    // App Router: app/api/**/route.ts
    const appMatch = filePath.match(/(?:^|\/)app\/(api\/.+)\/route\.(ts|tsx|js|jsx)$/);
    if (appMatch) {
      const routePath = "/" + appMatch[1].replace(/\[\[?\w+\]?\]/g, ":param");
      if (seen.has(routePath)) continue;
      seen.add(routePath);

      controllers.push({
        id: nextId("ctrl"),
        type: "controller",
        label: routePath,
        sub: "API Route",
        shape: "rectangle",
        accent: "teal",
        filePath,
        methods: [], // Would need source parsing for exact methods
        line: 1,
      });
      continue;
    }

    // Pages Router: pages/api/**/*
    const pagesMatch = filePath.match(/(?:^|\/)pages\/(api\/.+)\.(ts|tsx|js|jsx)$/);
    if (pagesMatch) {
      const routePath = "/" + pagesMatch[1].replace(/\[\[?\w+\]?\]/g, ":param");
      if (seen.has(routePath)) continue;
      seen.add(routePath);

      controllers.push({
        id: nextId("ctrl"),
        type: "controller",
        label: routePath,
        sub: "Pages API",
        shape: "rectangle",
        accent: "teal",
        filePath,
        methods: ["HANDLER"],
        line: 1,
      });
    }
  }

  return controllers.sort((a, b) => a.label.localeCompare(b.label));
}

// ─── 5. TOP-LEVEL ORCHESTRATOR ────────────────────────────────────────────────

export interface SourceFile {
  path: string;
  content: string;
}

/**
 * Run the complete deterministic 70% parse pipeline.
 */
export function runDeterministicParse(
  files: SourceFile[],
  ddl?: string
): DeterministicParseResult {
  resetCounters();

  const filePaths = files.map((f) => f.path);
  const routes = parseRoutesFromFileTree(filePaths);
  const controllers = parseControllersFromFileTree(filePaths);

  // Build route map for validation attachment
  const routeByPath = new Map<string, ParsedRouteNode>();
  for (const r of routes) routeByPath.set(r.routePath, r);

  const validations: ParsedValidationNode[] = [];

  // Scan each file for validation footprints
  for (const file of files) {
    if (!isPageFile(file.path) && !/(?:^|\/)(app|pages)\//.test(file.path)) continue;

    // Find the route this file belongs to
    const route = routes.find((r) => r.filePath === file.path);
    const sourceKey = route?.routePath ?? file.path;

    const found = detectValidationFootprints(file.content, file.path, sourceKey);
    validations.push(...found);
  }

  // Parse DDL if provided
  let tables: ParsedTableNode[] = [];
  let ddlEdges: ParsedEdge[] = [];
  if (ddl) {
    const ddlResult = parseDdlSchema(ddl);
    tables = ddlResult.tables;
    ddlEdges = ddlResult.edges;
  }

  // Build edges from routes → validations → controllers
  const edges: ParsedEdge[] = [...ddlEdges];

  for (const val of validations) {
    // Find the source route
    const sourceRoute = routes.find((r) => r.routePath === val.sourceKey);
    if (sourceRoute) {
      edges.push({
        id: nextId("edge"),
        from: sourceRoute.id,
        to: val.id,
      });
    }
  }

  return {
    routes,
    validations,
    controllers,
    tables,
    edges,
    stats: {
      routesDetected: routes.length,
      validationsDetected: validations.length,
      controllersDetected: controllers.length,
      tablesDetected: tables.length,
      fkRelationships: ddlEdges.filter((e) => e.cardinality).length,
    },
  };
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function findLineNumber(source: string, pattern: RegExp): number {
  const m = pattern.exec(source);
  if (!m) return 1;
  return source.substring(0, m.index).split("\n").length;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
