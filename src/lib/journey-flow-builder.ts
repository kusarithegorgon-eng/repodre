/**
 * Journey Flow Builder
 *
 * Constructs a continuous user-journey flowchart from parsed repository files.
 * The flow follows the system process:
 *
 *   START → Landing Page → Auth Login → Validation → User Decisions →
 *   (branch per decision) → Validations → ... → Logout → (back to Landing)
 *
 * Every node is connected — no dead-ends, no orphans. The flowchart loops
 * back from Logout to Landing so the diagram has no end.
 *
 * Detection is file-content-driven: the builder scans parsed modules for
 * auth, validation, CRUD, logout, and route signals and weaves them into
 * a single connected journey graph.
 *
 * Action Refinement (Code Peek):
 *   For files identified as Actions/Controllers, the builder inspects the
 *   file content for ORM method calls to refine the action type:
 *     - .create / .insert / .save  → "CREATE Action" (green)
 *     - .find / .findOne / .get    → "READ Action" (blue)
 *     - .update / .patch / .put    → "UPDATE Action" (amber)
 *     - .delete / .remove          → "DELETE Action" (red)
 *
 *   Context-aware edges: an Action is only connected to the Database node
 *   whose model name appears in the Action file's import statements.
 */

import type { ParsedModule } from "./ast-parser";
import type { Shape } from "./canvas-geometry";

// ─── Types ────────────────────────────────────────────────────────────────

export type JourneyNodeType =
  | "start"
  | "page"
  | "auth"
  | "validation"
  | "decision"
  | "action"
  | "database"
  | "logout"
  | "end"
  | "middleware"
  | "external_service"
  | "service"
  | "error_handler"
  | "cache";

/** Fine-grained CRUD classification for action nodes */
export type ActionCrudType = "CREATE" | "READ" | "UPDATE" | "DELETE" | "API";

export interface JourneyNode {
  id: string;
  type: JourneyNodeType;
  label: string;
  sub: string;
  shape: Shape;
  accent: "green" | "teal" | "blue" | "purple" | "orange" | "red";
  sourcePath?: string;
  col: number;
  row: number;
  /** For action nodes: the refined CRUD type */
  crudType?: ActionCrudType;
  /** DB model names this action imports/references */
  referencedModels?: string[];
  /** For decision nodes: the route targets this decision branches to */
  decisionTargets?: string[];
}

export interface JourneyEdge {
  id: string;
  from: string;
  to: string;
  label?: string;
}

export interface JourneyGraph {
  nodes: JourneyNode[];
  edges: JourneyEdge[];
}

// ─── Visual style per node type ───────────────────────────────────────────

const BASE_STYLE: Record<JourneyNodeType, { shape: Shape; accent: JourneyNode["accent"]; sub: string }> = {
  start:            { shape: "pill",        accent: "green",  sub: "Start" },
  page:             { shape: "pill",        accent: "teal",   sub: "Page" },
  auth:             { shape: "diamond",     accent: "orange", sub: "Auth" },
  validation:       { shape: "diamond",     accent: "purple", sub: "Validation" },
  decision:         { shape: "diamond",     accent: "orange", sub: "Decision" },
  action:           { shape: "rectangle",   accent: "teal",   sub: "Action" },
  database:         { shape: "cylinder",    accent: "blue",   sub: "Database" },
  logout:           { shape: "pill",        accent: "red",    sub: "Logout" },
  end:              { shape: "pill",        accent: "green",  sub: "Loop" },
  middleware:       { shape: "hexagon",     accent: "orange", sub: "Middleware" },
  external_service: { shape: "parallelogram", accent: "teal", sub: "External Service" },
  service:          { shape: "rectangle",   accent: "purple", sub: "Background Service" },
  error_handler:    { shape: "diamond",     accent: "red",    sub: "Error Handler" },
  cache:            { shape: "hexagon",     accent: "green",  sub: "Cache Layer" },
};

/** Per-CRUD styling overrides for action nodes */
const CRUD_STYLE: Record<ActionCrudType, { accent: JourneyNode["accent"]; sub: string; label: string }> = {
  CREATE: { accent: "green",  sub: "CREATE Action", label: "CREATE Action" },
  READ:   { accent: "blue",   sub: "READ Action",   label: "READ Action" },
  UPDATE: { accent: "purple", sub: "UPDATE Action", label: "UPDATE Action" },
  DELETE: { accent: "red",    sub: "DELETE Action", label: "DELETE Action" },
  API:    { accent: "teal",   sub: "Action",        label: "API Action" },
};

// ─── Signal detection ─────────────────────────────────────────────────────

interface DetectedSignals {
  isLanding: boolean;
  isAuth: boolean;
  isLogout: boolean;
  isValidation: boolean;
  isApi: boolean;
  isDatabase: boolean;
  isMiddleware: boolean;
  isExternalService: boolean;
  isBackgroundService: boolean;
  isErrorHandler: boolean;
  isCache: boolean;
  crudType: ActionCrudType;
  routePath: string | null;
  decisions: string[];
  storageActions: StorageAction[];
  /** DB model names inferred from import statements */
  importedModels: string[];
  /** External service names detected (stripe, sendgrid, etc.) */
  externalServices: string[];
}

interface StorageAction {
  trigger: string;
  dbLabel: string;
  edgeLabel: string;
}

/**
 * Extract model/table names referenced in import statements.
 * Looks for patterns like:
 *   import User from './models/user'
 *   import { Post } from '@/models/post'
 *   const db = require('./db/order')
 *   from 'prisma/client' (prisma generated types)
 */
function extractImportedModels(source: string): string[] {
  const models: string[] = [];
  const src = source.toLowerCase();

  // Match: from './models/something' or from '../models/something'
  const modelPathMatches = [...src.matchAll(/from\s+['"`][^'"`]*(?:models?|schema|entity|entities|db|database)\/([a-z0-9_-]+)/g)];
  for (const m of modelPathMatches) {
    if (m[1]) models.push(m[1].replace(/[-_]/g, " ").trim());
  }

  // Match: import Something from './something.model' or './something.schema'
  const modelFileMatches = [...src.matchAll(/from\s+['"`][^'"`]*\/([a-z0-9_-]+)\.(?:model|schema|entity|service)\b/g)];
  for (const m of modelFileMatches) {
    if (m[1]) models.push(m[1].replace(/[-_]/g, " ").trim());
  }

  // Match Prisma-style: prisma.user.create / prisma.post.findMany etc.
  const prismaMatches = [...src.matchAll(/prisma\.([a-z][a-z0-9_]*)\./g)];
  for (const m of prismaMatches) {
    if (m[1] && !["$connect", "$disconnect", "$transaction"].includes(m[1])) {
      models.push(m[1].replace(/[-_]/g, " ").trim());
    }
  }

  // Match Mongoose: User.find / Post.create etc.
  const mongooseMatches = [...src.matchAll(/\b([a-z][a-z0-9]*)\s*\.\s*(?:find|findone|findbyid|create|update|delete|save|remove|insertmany|updatemany|deletemany)\s*\(/g)];
  for (const m of mongooseMatches) {
    const name = m[1];
    // Skip common non-model words
    if (!["db", "client", "conn", "res", "req", "err", "data", "result", "body"].includes(name)) {
      models.push(name);
    }
  }

  // Match Supabase: supabase.from('users') / supabase.from('posts')
  const supabaseMatches = [...src.matchAll(/supabase\s*\.\s*from\s*\(\s*['"`]([a-z0-9_]+)['"`]/g)];
  for (const m of supabaseMatches) {
    if (m[1]) models.push(m[1].replace(/_/g, " ").trim());
  }

  return [...new Set(models)];
}

/**
 * Detect the most specific CRUD type from file content.
 * Uses ORM method call patterns for precision.
 * Logs the result for debugging.
 */
function detectCrudType(src: string, filename: string, isApi: boolean): ActionCrudType {
  if (!isApi) return "API";

  // ORM method-call patterns (highest precision)
  const hasOrmCreate = /\.\s*create\s*\(|\.insert\s*\(|\.insertMany\s*\(|\.insertOne\s*\(|\.save\s*\(|\.add\s*\(/.test(src);
  const hasOrmRead   = /\.\s*find\s*\(|\.findOne\s*\(|\.findMany\s*\(|\.findById\s*\(|\.findFirst\s*\(|\.get\s*\(|\.select\s*\(|\.findAll\s*\(|\.findUnique\s*\(/.test(src);
  const hasOrmUpdate = /\.\s*update\s*\(|\.updateOne\s*\(|\.updateMany\s*\(|\.patch\s*\(|\.put\s*\(|\.upsert\s*\(/.test(src);
  const hasOrmDelete = /\.\s*delete\s*\(|\.deleteOne\s*\(|\.deleteMany\s*\(|\.remove\s*\(|\.destroy\s*\(/.test(src);

  // HTTP method exports (secondary signal)
  const hasPost   = /export\s+async\s+function\s+post\b/.test(src);
  const hasGet    = /export\s+async\s+function\s+get\b/.test(src);
  const hasPut    = /export\s+async\s+function\s+put\b/.test(src);
  const hasDelete = /export\s+async\s+function\s+delete\b/.test(src);
  const hasPatch  = /export\s+async\s+function\s+patch\b/.test(src);

  let crudType: ActionCrudType = "API";

  // ORM method calls take priority over HTTP export names
  if (hasOrmCreate && !hasOrmRead && !hasOrmUpdate) {
    crudType = "CREATE";
  } else if (hasOrmRead && !hasOrmCreate && !hasOrmUpdate) {
    crudType = "READ";
  } else if (hasOrmUpdate && !hasOrmCreate) {
    crudType = "UPDATE";
  } else if (hasOrmDelete && !hasOrmCreate && !hasOrmRead) {
    crudType = "DELETE";
  } else if (hasOrmCreate) {
    // Mixed signals: CREATE takes precedence when both create and read present
    crudType = "CREATE";
  } else if (hasPost) {
    crudType = "CREATE";
  } else if (hasGet) {
    crudType = "READ";
  } else if (hasPut || hasPatch) {
    crudType = "UPDATE";
  } else if (hasDelete) {
    crudType = "DELETE";
  }

  if (crudType !== "API") {
    console.log(`Refining Action node: ${filename} identified as ${crudType} Action`);
  }

  return crudType;
}

function detectSignals(mod: ParsedModule): DetectedSignals {
  const src = mod.source.toLowerCase();
  const path = mod.path.toLowerCase();
  const filename = mod.path.split("/").pop() ?? mod.path;

  const isLanding =
    /(?:^|\/)app\/page\.(tsx|ts|js|jsx)$/.test(mod.path) ||
    /(?:^|\/)pages\/index\.(tsx|ts|js|jsx)$/.test(mod.path) ||
    /(?:^|\/)app\/layout\.(tsx|ts|js|jsx)$/.test(mod.path);

  const isAuth =
    /sign\s*in|sign\s*up|login|log\s*in|register|authenticat|signin|signup/.test(src) ||
    path.includes("auth") ||
    path.includes("login") ||
    path.includes("signup");

  const isLogout = /sign\s*out|log\s*out|logout|signout/.test(src) || path.includes("logout");

  const isValidation =
    /z\.\s*object\s*\(/.test(src) ||
    /z\.\s*(string|number|email|password|boolean|date|enum|array)\s*\(/.test(src) ||
    /\.safeParse\s*\(/.test(src) ||
    /\.parse\s*\(/.test(src) ||
    /yup\.\s*(object|string|number|boolean|date|array)\s*\(/.test(src) ||
    /\.validate\s*\(/.test(src) ||
    (/if\s*\(\s*!/.test(src) && /throw\s+new\s+Error/.test(src));

  const isApi =
    path.includes("api/") ||
    path.includes("server") ||
    path.includes("controller") ||
    /export\s+async\s+function\s+(get|post|put|delete|patch)/.test(src) ||
    /app\/.*\/route\.(ts|tsx|js|jsx)$/.test(mod.path);

  const isDatabase =
    src.includes("prisma") ||
    src.includes("schema") ||
    src.includes("model") ||
    src.includes("supabase") ||
    src.includes("mongoose") ||
    src.includes("create table") ||
    src.includes("select * from");

  // ── Middleware Detection ────────────────────────────────────────────────
  // Files named middleware.ts or containing guard/auth middleware patterns
  const isMiddleware =
    filename === "middleware.ts" ||
    filename === "middleware.js" ||
    path.includes("/middleware") ||
    /export\s+(async\s+)?function\s+middleware/.test(src) ||
    /export\s+const\s+middleware/.test(src) ||
    /nextauth\(\s*\)/.test(src) ||
    /getServerSession/.test(src) ||
    /withAuth/.test(src) ||
    path.includes("guard") ||
    path.includes("_middleware");

  // ── External Service Detection ──────────────────────────────────────────
  // Imports from known external service SDKs
  const externalServicePatterns = [
    { name: "stripe", pattern: /from\s+['"`]stripe['"`]|require\s*\(\s*['"`]stripe['"`]\]|stripe\s*\(|Stripe\s*\(/ },
    { name: "sendgrid", pattern: /from\s+['"`]@sendgrid|require\s*\(\s*['"`]@sendgrid|sendgrid|@sendgrid\/mail/ },
    { name: "aws", pattern: /from\s+['"`]aws-sdk|require\s*\(\s*['"`]aws-sdk|aws\.|s3\.|dynamo|lambda|sns|sqs/i },
    { name: "firebase", pattern: /from\s+['"`]firebase|require\s*\(\s*['"`]firebase|firebase\.|firestore|firebaseapp/i },
    { name: "twilio", pattern: /from\s+['"`]twilio|require\s*\(\s*['"`]twilio|twilio\s*\(/i },
    { name: "sendgrid", pattern: /from\s+['"`]@sendgrid|sendgrid/i },
    { name: "openai", pattern: /from\s+['"`]openai|require\s*\(\s*['"`]openai|openai\s*\(/i },
    { name: "cloudinary", pattern: /from\s+['"`]cloudinary|cloudinary\.v2|cloudinary\.uploader/i },
    { name: "redis", pattern: /from\s+['"`]ioredis|from\s+['"`]redis|redis\.|createredisclient/i },
    { name: "github", pattern: /from\s+['"`]@octokit|octokit\.|github\.octokit/i },
    { name: "slack", pattern: /from\s+['"`]@slack|slackapi|slack\.|slackbot/i },
  ];

  const detectedExternalServices: string[] = [];
  for (const { name, pattern } of externalServicePatterns) {
    if (pattern.test(src)) {
      detectedExternalServices.push(name);
    }
  }

  const isExternalService = detectedExternalServices.length > 0;

  // ── Background Service Detection ────────────────────────────────────────
  // Files in utils, services, workers, jobs folders or containing worker patterns
  const isBackgroundService =
    path.includes("/services/") ||
    path.includes("/workers/") ||
    path.includes("/jobs/") ||
    path.includes("/utils/") ||
    path.includes("/queues/") ||
    /queue\.|bull\.|worker\.|cron|schedule|background|job/i.test(src) ||
    /setInterval|settimeout|worker_threads|child_process/i.test(src) ||
    /export\s+(const|function)\s+\w*worker/i.test(src) ||
    /export\s+(const|function)\s+\w*job/i.test(src) ||
    /export\s+(const|function)\s+\w*queue/i.test(src);

  // ── Error Handler Detection ─────────────────────────────────────────────
  // Files that handle errors, logging, or have error boundaries
  const isErrorHandler =
    path.includes("/errors/") ||
    path.includes("/logger/") ||
    path.includes("/logging/") ||
    filename.includes("error") ||
    filename.includes("logger") ||
    filename.includes("logging") ||
    /errorboundary|error\s*handler|catch\s*\(|try\s*\{|\.error\s*\(|logger\.|winston|bunyan|pino|sentry/i.test(src) ||
    /captureException|captureMessage|errorHandler/i.test(src) ||
    /next\.js\s*\|\|\s*error/i.test(src);

  // ── Cache Layer Detection ───────────────────────────────────────────────
  // Files that implement caching logic
  const isCache =
    path.includes("/cache/") ||
    filename.includes("cache") ||
    /\.cache\s*\(|cache\.|memcached|redis.*cache|react-query|tanstack\/query|usequery|usemutation/i.test(src) ||
    /stale-while-revalidate|swr|cachestore|cachestrategy/i.test(src) ||
    /next\s*\.\s*cache|unstable_cache/i.test(src);

  // Refined CRUD detection using ORM method calls
  const crudType = detectCrudType(src, filename, isApi);

  // Route path extraction
  let routePath: string | null = null;
  const appMatch = mod.path.match(/(?:^|\/)app\/(.+?)\/page\.(?:tsx|ts|js|jsx)$/);
  if (appMatch) routePath = `/${appMatch[1]}`;
  if (!routePath) {
    const pagesMatch = mod.path.match(/(?:^|\/)pages\/(.+?)\.(?:tsx|ts|js|jsx)$/);
    if (pagesMatch && !pagesMatch[1].startsWith("api/") && !pagesMatch[1].startsWith("_")) {
      routePath = `/${pagesMatch[1].replace(/\[|\]/g, ":")}`;
    }
  }

  // Detect user decisions
  const decisions: string[] = [];
  const navMatches = [...src.matchAll(/router\.push\s*\(\s*['"`]([^'"`]+)['"`]/g)];
  for (const m of navMatches) {
    if (m[1] && !decisions.includes(m[1])) decisions.push(m[1]);
  }
  const linkMatches = [...src.matchAll(/<link[^>]+href\s*=\s*['"`]([^'"`]+)['"`]/g)];
  for (const m of linkMatches) {
    if (m[1] && !decisions.includes(m[1])) decisions.push(m[1]);
  }
  const hrefMatches = [...src.matchAll(/href\s*=\s*['"`]([^'"`]+)['"`]/g)];
  for (const m of hrefMatches) {
    if (m[1] && !m[1].startsWith("#") && !decisions.includes(m[1])) decisions.push(m[1]);
  }

  // Detect data-storing actions
  const storageActions: StorageAction[] = [];
  const has = (kw: string) => src.includes(kw) || path.includes(kw);

  if (isAuth && (has("register") || has("signup") || has("sign up") || has("create"))) {
    storageActions.push({ trigger: "register", dbLabel: "auth profile created", edgeLabel: "store profile" });
  }
  if (has("project") && (has("create") || has("add") || has("insert") || crudType === "CREATE")) {
    storageActions.push({ trigger: "create project", dbLabel: "project stored", edgeLabel: "save project" });
  }
  if (has("post") && (has("create") || has("add") || has("publish") || crudType === "CREATE")) {
    storageActions.push({ trigger: "create post", dbLabel: "post stored", edgeLabel: "save post" });
  }
  if (has("comment") && (has("create") || has("add") || has("post") || crudType === "CREATE")) {
    storageActions.push({ trigger: "add comment", dbLabel: "comment stored", edgeLabel: "save comment" });
  }
  if (has("upload") && (has("file") || has("image") || has("avatar"))) {
    storageActions.push({ trigger: "upload file", dbLabel: "file stored", edgeLabel: "save file" });
  }
  if (has("order") && (has("create") || has("place") || has("submit") || crudType === "CREATE")) {
    storageActions.push({ trigger: "place order", dbLabel: "order stored", edgeLabel: "save order" });
  }
  if (has("profile") && (has("update") || has("edit") || crudType === "UPDATE")) {
    storageActions.push({ trigger: "update profile", dbLabel: "profile updated", edgeLabel: "update record" });
  }
  if (crudType === "CREATE" && storageActions.length === 0) {
    storageActions.push({ trigger: "create", dbLabel: "record stored", edgeLabel: "save data" });
  }

  // Extract referenced DB models from imports
  const importedModels = extractImportedModels(mod.source);

  // Log detected process nodes
  if (isMiddleware) console.log(`Detected MIDDLEWARE node: ${filename}`);
  if (isExternalService) console.log(`Detected EXTERNAL_SERVICE node: ${filename} → [${detectedExternalServices.join(", ")}]`);
  if (isBackgroundService) console.log(`Detected SERVICE node: ${filename}`);
  if (isErrorHandler) console.log(`Detected ERROR_HANDLER node: ${filename}`);
  if (isCache) console.log(`Detected CACHE node: ${filename}`);

  return {
    isLanding,
    isAuth,
    isLogout,
    isValidation,
    isApi,
    isDatabase,
    isMiddleware,
    isExternalService,
    isBackgroundService,
    isErrorHandler,
    isCache,
    crudType,
    routePath,
    decisions,
    storageActions,
    importedModels,
    externalServices: detectedExternalServices,
  };
}

// ─── ID generation ────────────────────────────────────────────────────────

let nodeCounter = 0;
let edgeCounter = 0;

function nextNodeId(): string { return `j_${++nodeCounter}`; }
function nextEdgeId(): string { return `j_e${++edgeCounter}`; }
function resetCounters(): void { nodeCounter = 0; edgeCounter = 0; }

// ─── Main builder ─────────────────────────────────────────────────────────

/**
 * Build a continuous user-journey flowchart from parsed modules.
 */
export function buildJourneyGraph(modules: ParsedModule[]): JourneyGraph {
  resetCounters();

  const nodes: JourneyNode[] = [];
  const edges: JourneyEdge[] = [];
  const edgeExists = new Set<string>();

  const addNode = (
    type: JourneyNodeType,
    label: string,
    col: number,
    row: number,
    sourcePath?: string,
    overrides?: Partial<Pick<JourneyNode, "accent" | "sub" | "crudType" | "referencedModels" | "decisionTargets">>
  ): JourneyNode => {
    const style = BASE_STYLE[type];
    const node: JourneyNode = {
      id: nextNodeId(),
      type,
      label,
      sub: overrides?.sub ?? style.sub,
      shape: style.shape,
      accent: overrides?.accent ?? style.accent,
      col,
      row,
      sourcePath,
      crudType: overrides?.crudType,
      referencedModels: overrides?.referencedModels,
      decisionTargets: overrides?.decisionTargets,
    };
    nodes.push(node);
    return node;
  };

  const addEdge = (from: string, to: string, label?: string) => {
    const key = `${from}→${to}→${label ?? ""}`;
    if (edgeExists.has(key)) return;
    edgeExists.add(key);
    edges.push({ id: nextEdgeId(), from, to, label });
  };

  const colRows = new Map<number, number>();
  const placeInCol = (col: number): number => {
    const row = colRows.get(col) ?? 0;
    colRows.set(col, row + 1);
    return row;
  };

  // ── Fixed skeleton ───────────────────────────────────────────────────
  const startNode = addNode("start", "Start", 0, placeInCol(0));
  const landingNode = addNode("page", "Landing Page", 1, placeInCol(1));
  addEdge(startNode.id, landingNode.id, "open app");

  // ── Scan modules ─────────────────────────────────────────────────────
  let authNode: JourneyNode | null = null;
  let logoutNode: JourneyNode | null = null;
  const validationNodes: JourneyNode[] = [];
  const decisionNodes: JourneyNode[] = [];
  const actionNodes: JourneyNode[] = [];
  const dbNodes: JourneyNode[] = [];
  const pageNodes: JourneyNode[] = [];
  const storageEdges: { dbNode: JourneyNode; edgeLabel: string; trigger: string }[] = [];

  // Process nodes (new architectural layers)
  const middlewareNodes: JourneyNode[] = [];
  const externalServiceNodes: JourneyNode[] = [];
  const serviceNodes: JourneyNode[] = [];
  const errorHandlerNodes: JourneyNode[] = [];
  const cacheNodes: JourneyNode[] = [];

  // Track DB nodes by label for context-aware edge matching
  const dbNodeByLabel = new Map<string, JourneyNode>();

  for (const mod of modules) {
    const sig = detectSignals(mod);

    if (sig.isAuth && !authNode) {
      authNode = addNode("auth", "Auth Login", 2, placeInCol(2), mod.path);
    }

    if (sig.isLogout && !logoutNode) {
      logoutNode = addNode("logout", "Logout", 7, placeInCol(7), mod.path);
    }

    if (sig.isValidation) {
      const label = sig.isAuth ? "Validate Credentials" : "Validate Input";
      if (!validationNodes.some((v) => v.label === label)) {
        validationNodes.push(addNode("validation", label, 3, placeInCol(3), mod.path));
      }
    }

    if (sig.decisions.length > 0 && sig.routePath) {
      const label = `Choose: ${sig.routePath}`;
      if (!decisionNodes.some((d) => d.label === label)) {
        decisionNodes.push(addNode("decision", label, 4, placeInCol(4), mod.path, {
          decisionTargets: sig.decisions,
        }));
      }
    }

    // Action nodes — use refined CRUD type for label, color, and sub
    if (sig.isApi) {
      const crudStyle = CRUD_STYLE[sig.crudType];
      const label = crudStyle.label;

      if (!actionNodes.some((a) => a.label === label)) {
        const aNode = addNode("action", label, 5, placeInCol(5), mod.path, {
          accent: crudStyle.accent,
          sub: crudStyle.sub,
          crudType: sig.crudType,
          referencedModels: sig.importedModels,
        });
        actionNodes.push(aNode);
      } else if (sig.importedModels.length > 0) {
        // Merge referenced models into existing action node of same type
        const existing = actionNodes.find((a) => a.label === label);
        if (existing) {
          existing.referencedModels = [
            ...(existing.referencedModels ?? []),
            ...sig.importedModels,
          ];
        }
      }
    }

    // ── Process Node Detection ───────────────────────────────────────────
    // Middleware/Guard nodes
    if (sig.isMiddleware) {
      const filename = mod.path.split("/").pop()?.replace(/\.\w+$/, "") || "middleware";
      const label = `Auth Guard: ${filename}`;
      if (!middlewareNodes.some((m) => m.label === label)) {
        middlewareNodes.push(addNode("middleware", label, 2, placeInCol(2), mod.path));
      }
    }

    // External service nodes
    if (sig.isExternalService && sig.externalServices.length > 0) {
      for (const svcName of sig.externalServices) {
        const label = `External: ${svcName.charAt(0).toUpperCase() + svcName.slice(1)}`;
        if (!externalServiceNodes.some((e) => e.label === label)) {
          externalServiceNodes.push(addNode("external_service", label, 5, placeInCol(5), mod.path));
        }
      }
    }

    // Background service nodes
    if (sig.isBackgroundService) {
      const filename = mod.path.split("/").pop()?.replace(/\.\w+$/, "") || "service";
      const label = `Service: ${filename}`;
      if (!serviceNodes.some((s) => s.label === label)) {
        serviceNodes.push(addNode("service", label, 5, placeInCol(5), mod.path));
      }
    }

    // Error handler nodes
    if (sig.isErrorHandler) {
      const filename = mod.path.split("/").pop()?.replace(/\.\w+$/, "") || "error";
      const label = `Error Handler: ${filename}`;
      if (!errorHandlerNodes.some((e) => e.label === label)) {
        errorHandlerNodes.push(addNode("error_handler", label, 6, placeInCol(6), mod.path));
      }
    }

    // Cache layer nodes
    if (sig.isCache) {
      const filename = mod.path.split("/").pop()?.replace(/\.\w+$/, "") || "cache";
      const label = `Cache: ${filename}`;
      if (!cacheNodes.some((c) => c.label === label)) {
        cacheNodes.push(addNode("cache", label, 5, placeInCol(5), mod.path));
      }
    }

    // Storage DB nodes
    for (const sa of sig.storageActions) {
      if (!dbNodeByLabel.has(sa.dbLabel)) {
        const dbNode = addNode("database", sa.dbLabel, 6, placeInCol(6), mod.path);
        dbNodes.push(dbNode);
        dbNodeByLabel.set(sa.dbLabel, dbNode);
        storageEdges.push({ dbNode, edgeLabel: sa.edgeLabel, trigger: sa.trigger });
      }
    }

    // File-based DB nodes
    if (sig.isDatabase) {
      const filename = mod.path.split("/").pop()?.replace(/\.\w+$/, "") || "Database";
      const label = `DB: ${filename}`;
      if (!dbNodeByLabel.has(label)) {
        const dbNode = addNode("database", label, 6, placeInCol(6), mod.path);
        dbNodes.push(dbNode);
        dbNodeByLabel.set(label, dbNode);
      }
    }

    if (sig.routePath && !sig.isLanding && !sig.isAuth && !sig.isLogout) {
      if (!pageNodes.some((p) => p.label === sig.routePath) && !sig.isApi) {
        pageNodes.push(addNode("page", sig.routePath, 4, placeInCol(4), mod.path));
      }
    }
  }

  // ── Weave skeleton ───────────────────────────────────────────────────
  let lastNode = landingNode;

  if (authNode) {
    addEdge(landingNode.id, authNode.id, "needs login");
    lastNode = authNode;
  }

  if (validationNodes.length > 0 && authNode) {
    const credValidation = validationNodes.find((v) => v.label === "Validate Credentials");
    if (credValidation) {
      addEdge(authNode.id, credValidation.id, "check");
      addEdge(credValidation.id, authNode.id, "fail → retry");
      lastNode = credValidation;
    }
  }

  const decisionAndPages = [...decisionNodes, ...pageNodes];
  if (decisionAndPages.length > 0) {
    // Connect the entry point (last skeleton node) to the first decision/page
    addEdge(lastNode.id, decisionAndPages[0].id, "browse");

    // Branch decisions to their target pages so the tree layout can spread
    // children horizontally (family-tree look). Each decision node stores the
    // route targets it navigates to; we create a "yes" edge to each matching
    // page node. This makes the target pages SIBLINGS (all children of the
    // decision) rather than a sequential chain.
    const branchedPageIds = new Set<string>();
    for (const decision of decisionNodes) {
      const targets = decision.decisionTargets ?? [];
      for (const target of targets) {
        const targetPage = pageNodes.find((p) => p.label === target);
        if (targetPage) {
          addEdge(decision.id, targetPage.id, "yes");
          branchedPageIds.add(targetPage.id);
        }
      }
    }

    // Sequential fallback for pages NOT reachable via decision branches.
    // Skip pages that are already branched (they're siblings, not a chain).
    const unbranched = decisionAndPages.filter((n) => !branchedPageIds.has(n.id));
    for (let i = 0; i < unbranched.length - 1; i++) {
      const from = unbranched[i];
      const to = unbranched[i + 1];
      const hasBranch = edges.some((e) => e.from === from.id && e.to === to.id);
      if (!hasBranch) {
        addEdge(from.id, to.id, "navigate");
      }
    }

    // Connect the last page in the tree to the first action via a "flow" edge
    // so the action subtree is reachable from the root in the tree layout.
    // (The per-decision "select" convergence edges are still added below for
    // the visual graph, but "flow" is the tree edge that keeps the layout
    // connected.)
    if (actionNodes.length > 0 && decisionAndPages.length > 0) {
      const lastPage = decisionAndPages[decisionAndPages.length - 1];
      addEdge(lastPage.id, actionNodes[0].id, "flow");
    }

    // All decisions/pages converge to the first action (if any) — these are
    // convergence edges for the visual graph, not tree edges.
    for (const decision of decisionAndPages) {
      if (actionNodes.length > 0) {
        addEdge(decision.id, actionNodes[0].id, "select");
      }
    }
    lastNode = decisionAndPages[decisionAndPages.length - 1];
  }

  // Actions → Database (context-aware)
  if (actionNodes.length > 0) {
    for (let i = 0; i < actionNodes.length - 1; i++) {
      addEdge(actionNodes[i].id, actionNodes[i + 1].id, "next");
    }

    for (const action of actionNodes) {
      const models = action.referencedModels ?? [];

      if (models.length > 0) {
        // Context-aware: only connect to DB nodes whose label matches an imported model
        let matched = false;
        for (const [dbLabel, dbNode] of dbNodeByLabel) {
          const dbLabelLower = dbLabel.toLowerCase();
          for (const model of models) {
            if (dbLabelLower.includes(model) || model.includes(dbLabelLower.replace(/^db:\s*/, ""))) {
              addEdge(action.id, dbNode.id, `${action.crudType ?? "query"} → ${model}`);
              matched = true;
              break;
            }
          }
        }

        // Fallback: if no model match, connect to first DB node
        if (!matched && dbNodes.length > 0) {
          addEdge(action.id, dbNodes[0].id, "query");
        }
      } else if (dbNodes.length > 0) {
        // No model info: fall back to first DB node
        addEdge(action.id, dbNodes[0].id, "query");
      }
    }

    // Storage-action labelled edges
    for (const se of storageEdges) {
      const matchingAction = actionNodes.find((a) => {
        if (se.trigger === "update profile") return a.crudType === "UPDATE";
        return a.crudType === "CREATE";
      });
      if (matchingAction) {
        addEdge(matchingAction.id, se.dbNode.id, se.edgeLabel);
      } else if (actionNodes.length > 0) {
        addEdge(actionNodes[0].id, se.dbNode.id, se.edgeLabel);
      } else if (decisionAndPages.length > 0) {
        addEdge(decisionAndPages[0].id, se.dbNode.id, se.edgeLabel);
      } else {
        addEdge(lastNode.id, se.dbNode.id, se.edgeLabel);
      }
    }

    lastNode = actionNodes[actionNodes.length - 1];
  }

  // ── Process Node Edge Weaving ───────────────────────────────────────────
  // Middleware guards sit between auth and actions/controllers
  if (middlewareNodes.length > 0) {
    for (let i = 0; i < middlewareNodes.length - 1; i++) {
      addEdge(middlewareNodes[i].id, middlewareNodes[i + 1].id, "chain");
    }
    // Connect middleware to actions they protect
    for (const middleware of middlewareNodes) {
      if (actionNodes.length > 0) {
        addEdge(middleware.id, actionNodes[0].id, "guard");
      }
    }
    // Connect auth to first middleware if no direct auth->action edge
    if (authNode && middlewareNodes.length > 0) {
      addEdge(authNode.id, middlewareNodes[0].id, "protected by");
    }
  }

  // External services connect to actions that call them
  if (externalServiceNodes.length > 0) {
    for (const extSvc of externalServiceNodes) {
      // Connect to first action (they're specific API integrations)
      if (actionNodes.length > 0) {
        addEdge(actionNodes[0].id, extSvc.id, "call external");
      } else if (decisionAndPages.length > 0) {
        addEdge(decisionAndPages[0].id, extSvc.id, "integrate");
      }
    }
  }

  // Background services connect to actions that trigger them
  if (serviceNodes.length > 0) {
    for (const svc of serviceNodes) {
      if (actionNodes.length > 0) {
        addEdge(actionNodes[0].id, svc.id, "enqueue");
      }
      // Services may also write to DB
      if (dbNodes.length > 0) {
        addEdge(svc.id, dbNodes[0].id, "process");
      }
    }
  }

  // Error handlers catch errors from actions
  if (errorHandlerNodes.length > 0) {
    for (const errHandler of errorHandlerNodes) {
      if (actionNodes.length > 0) {
        addEdge(actionNodes[0].id, errHandler.id, "catch error");
      }
      // Error handlers may also log to DB or external services
      if (dbNodes.length > 0) {
        addEdge(errHandler.id, dbNodes[0].id, "log");
      }
    }
  }

  // Cache layer sits between actions and database
  if (cacheNodes.length > 0) {
    for (let i = 0; i < cacheNodes.length - 1; i++) {
      addEdge(cacheNodes[i].id, cacheNodes[i + 1].id, "chain");
    }
    // Actions check cache before hitting DB
    if (actionNodes.length > 0) {
      addEdge(actionNodes[0].id, cacheNodes[0].id, "check cache");
    }
    // Cache nodes connect to DB on miss
    if (dbNodes.length > 0) {
      addEdge(cacheNodes[0].id, dbNodes[0].id, "cache miss");
    }
  }

  // Database chain
  if (dbNodes.length > 0) {
    for (let i = 0; i < dbNodes.length - 1; i++) {
      addEdge(dbNodes[i].id, dbNodes[i + 1].id, "relate");
    }
    lastNode = dbNodes[dbNodes.length - 1];
  }

  // Input validations (non-credential)
  const inputValidations = validationNodes.filter((v) => v.label !== "Validate Credentials");
  for (const v of inputValidations) {
    if (decisionAndPages.length > 0) {
      addEdge(decisionAndPages[0].id, v.id, "submit");
      if (actionNodes.length > 0) {
        addEdge(v.id, actionNodes[0].id, "valid");
      } else {
        addEdge(v.id, logoutNode?.id ?? lastNode.id, "valid");
      }
      // Validation failures go to error handler
      if (errorHandlerNodes.length > 0) {
        addEdge(v.id, errorHandlerNodes[0].id, "invalid → error");
      }
    }
  }

  if (logoutNode) {
    addEdge(lastNode.id, logoutNode.id, "session end");
    lastNode = logoutNode;
  }

  const endNode = addNode("end", "Loop", 8, placeInCol(8));
  addEdge(lastNode.id, endNode.id, "complete");
  addEdge(endNode.id, landingNode.id, "restart");

  // ── Orphan insurance ─────────────────────────────────────────────────
  const hasIncoming = new Set<string>();
  const hasOutgoing = new Set<string>();
  for (const e of edges) {
    hasOutgoing.add(e.from);
    hasIncoming.add(e.to);
  }

  for (const node of nodes) {
    if (node.type === "start") continue;

    if (!hasIncoming.has(node.id)) {
      const prev = nodes.filter((n) => n.col < node.col).sort((a, b) => b.col - a.col)[0];
      if (prev) {
        addEdge(prev.id, node.id, "flow");
        hasOutgoing.add(prev.id);
        hasIncoming.add(node.id);
      } else {
        addEdge(startNode.id, node.id, "flow");
        hasIncoming.add(node.id);
      }
    }

    if (!hasOutgoing.has(node.id) && node.type !== "end") {
      const next = nodes.filter((n) => n.col > node.col && n.type !== "end").sort((a, b) => a.col - b.col)[0];
      if (next) {
        addEdge(node.id, next.id, "flow");
        hasOutgoing.add(node.id);
        hasIncoming.add(next.id);
      } else {
        addEdge(node.id, endNode.id, "flow");
        hasOutgoing.add(node.id);
      }
    }
  }

  return { nodes, edges };
}

// ─── Tree Layout ──────────────────────────────────────────────────────────

export interface TreeLayoutOptions {
  /** Horizontal spacing between sibling nodes at the same depth */
  nodeSep: number;
  /** Vertical spacing between tree levels (depths) */
  rankSep: number;
  /** Starting x offset */
  startX: number;
  /** Starting y offset */
  startY: number;
}

const DEFAULT_TREE_OPTIONS: TreeLayoutOptions = {
  nodeSep: 220,
  rankSep: 160,
  startX: 120,
  startY: 100,
};

/**
 * Compute a hierarchical tree layout for the journey graph.
 *
 * Builds a parent → children adjacency from the edges, roots at the
 * "start" node, and performs a post-order DFS:
 *   - Leaf nodes receive sequential x positions (left to right).
 *   - Internal nodes are centered over their children (average of
 *     direct children's x positions).
 *   - y is determined by depth (rank) in the tree.
 *
 * This produces a "family tree" look where decision nodes branch
 * their children horizontally rather than stacking everything in a
 * single vertical column.
 *
 * Nodes unreachable from the root are placed in a fallback column
 * to the right, ordered by depth.
 */
export function layoutJourneyTree(
  graph: JourneyGraph,
  options: Partial<TreeLayoutOptions> = {}
): Map<string, { x: number; y: number; depth: number }> {
  const opts = { ...DEFAULT_TREE_OPTIONS, ...options };
  const positions = new Map<string, { x: number; y: number; depth: number }>();

  if (graph.nodes.length === 0) return positions;

  // Build parent → children adjacency (deduplicated, preserving order).
  // Only follow "tree" edges that form the branching structure. Convergence
  // edges (select, query, call external, enqueue, catch error, check cache,
  // cache miss, log, process, relate, save, store, update record) merge
  // multiple parents into the same child, which would make the child an
  // "internal" node and prevent it from getting a sequential leaf x.
  // By ignoring convergence edges, the tree layout treats pages as leaves
  // and lets decision branches spread horizontally.
  const CONVERGENCE_LABELS = new Set([
    "select", "call external", "enqueue", "catch error",
    "check cache", "cache miss", "log",
    "save project", "save post", "save comment", "save file", "save order",
    "save data", "store profile", "update record",
  ]);
  const isTreeEdge = (label: string | undefined): boolean => {
    if (!label) return true;
    if (CONVERGENCE_LABELS.has(label)) return false;
    // CRUD-labelled edges (e.g., "CREATE → user") are convergence edges
    if (/^(CREATE|READ|UPDATE|DELETE)\s*→/.test(label)) return false;
    return true;
  };

  const children = new Map<string, string[]>();
  const parents = new Map<string, string[]>();
  for (const node of graph.nodes) {
    children.set(node.id, []);
    parents.set(node.id, []);
  }
  for (const edge of graph.edges) {
    if (edge.from === edge.to) continue; // skip self-loops
    if (!isTreeEdge(edge.label)) continue; // skip convergence edges
    const kids = children.get(edge.from);
    if (kids && !kids.includes(edge.to)) kids.push(edge.to);
    const pars = parents.get(edge.to);
    if (pars && !pars.includes(edge.from)) pars.push(edge.from);
  }

  // Find the root: prefer the "start" node, otherwise a node with no parents
  const startNode = graph.nodes.find((n) => n.type === "start");
  let root: string | undefined = startNode?.id;
  if (!root) {
    root = graph.nodes.find((n) => parents.get(n.id)!.length === 0)?.id;
  }
  if (!root) {
    root = graph.nodes[0].id;
  }

  // Track visited nodes to handle cycles (back edges)
  const visited = new Set<string>();
  const inStack = new Set<string>();
  let leafCounter = 0;

  /**
   * Post-order DFS: assign x to leaves sequentially, center internal
   * nodes over their children. Returns the depth of the subtree.
   */
  function dfs(nodeId: string, depth: number): number {
    if (inStack.has(nodeId)) return depth; // cycle — stop
    if (visited.has(nodeId)) {
      // Already positioned; return its existing depth
      return positions.get(nodeId)?.depth ?? depth;
    }
    visited.add(nodeId);
    inStack.add(nodeId);

    const kids = children.get(nodeId) ?? [];
    let maxDepth = depth;

    if (kids.length === 0) {
      // Leaf: assign next sequential x
      const x = opts.startX + leafCounter * opts.nodeSep;
      positions.set(nodeId, { x, y: opts.startY + depth * opts.rankSep, depth });
      leafCounter++;
    } else {
      // Internal node: recurse children first, then center over them
      const childDepths: number[] = [];
      for (const childId of kids) {
        const childDepth = dfs(childId, depth + 1);
        childDepths.push(childDepth);
        maxDepth = Math.max(maxDepth, childDepth);
      }

      // Center this node over its children's x positions
      const childXs = kids
        .map((cid) => positions.get(cid)?.x)
        .filter((x): x is number => x !== undefined);
      const x =
        childXs.length > 0
          ? childXs.reduce((a, b) => a + b, 0) / childXs.length
          : opts.startX + leafCounter * opts.nodeSep;
      positions.set(nodeId, { x, y: opts.startY + depth * opts.rankSep, depth });
    }

    inStack.delete(nodeId);
    return maxDepth;
  }

  dfs(root, 0);

  // Place any unreachable nodes in a fallback column to the right
  const unreachable = graph.nodes.filter((n) => !positions.has(n.id));
  if (unreachable.length > 0) {
    const fallbackX = opts.startX + (leafCounter + 1) * opts.nodeSep;
    unreachable.forEach((n, i) => {
      // Estimate depth from shortest path to any visited node
      let depth = 0;
      const pars = parents.get(n.id) ?? [];
      for (const p of pars) {
        const pd = positions.get(p)?.depth;
        if (pd !== undefined) depth = Math.max(depth, pd + 1);
      }
      positions.set(n.id, {
        x: fallbackX,
        y: opts.startY + depth * opts.rankSep + i * opts.nodeSep * 0.5,
        depth,
      });
    });
  }

  return positions;
}
