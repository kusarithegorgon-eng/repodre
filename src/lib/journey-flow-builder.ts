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
  | "end";

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
  start:      { shape: "pill",      accent: "green",  sub: "Start" },
  page:       { shape: "pill",      accent: "teal",   sub: "Page" },
  auth:       { shape: "diamond",   accent: "orange", sub: "Auth" },
  validation: { shape: "diamond",   accent: "purple", sub: "Validation" },
  decision:   { shape: "diamond",   accent: "orange", sub: "Decision" },
  action:     { shape: "rectangle", accent: "teal",   sub: "Action" },
  database:   { shape: "cylinder",  accent: "blue",   sub: "Database" },
  logout:     { shape: "pill",      accent: "red",    sub: "Logout" },
  end:        { shape: "pill",      accent: "green",  sub: "Loop" },
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
  crudType: ActionCrudType;
  routePath: string | null;
  decisions: string[];
  storageActions: StorageAction[];
  /** DB model names inferred from import statements */
  importedModels: string[];
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

  return {
    isLanding,
    isAuth,
    isLogout,
    isValidation,
    isApi,
    isDatabase,
    crudType,
    routePath,
    decisions,
    storageActions,
    importedModels,
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
    overrides?: Partial<Pick<JourneyNode, "accent" | "sub" | "crudType" | "referencedModels">>
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
        decisionNodes.push(addNode("decision", label, 4, placeInCol(4), mod.path));
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
    addEdge(lastNode.id, decisionAndPages[0].id, "browse");
    for (let i = 0; i < decisionAndPages.length - 1; i++) {
      addEdge(decisionAndPages[i].id, decisionAndPages[i + 1].id, "navigate");
    }
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
