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
 */

import type { ParsedModule } from "./ast-parser";
import type { Shape } from "./canvas-geometry";

// ─── Types ────────────────────────────────────────────────────────────────

export type JourneyNodeType =
  | "start" // entry point
  | "page" // user-facing page/view
  | "auth" // login / signup
  | "validation" // form / schema validation
  | "decision" // user decision branch
  | "action" // API / controller / logic
  | "database" // data persistence
  | "logout" // sign-out
  | "end"; // terminal (loops back)

export interface JourneyNode {
  id: string;
  type: JourneyNodeType;
  label: string;
  sub: string;
  shape: Shape;
  accent: "green" | "teal" | "blue" | "purple" | "orange" | "red";
  /** source file that inspired this node, if any */
  sourcePath?: string;
  /** column in the left-to-right layout */
  col: number;
  /** row within the column */
  row: number;
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

const STYLE: Record<JourneyNodeType, { shape: Shape; accent: JourneyNode["accent"]; sub: string }> = {
  start: { shape: "pill", accent: "green", sub: "Start" },
  page: { shape: "pill", accent: "teal", sub: "Page" },
  auth: { shape: "diamond", accent: "orange", sub: "Auth" },
  validation: { shape: "diamond", accent: "purple", sub: "Validation" },
  decision: { shape: "diamond", accent: "orange", sub: "Decision" },
  action: { shape: "rectangle", accent: "blue", sub: "Action" },
  database: { shape: "cylinder", accent: "blue", sub: "Database" },
  logout: { shape: "pill", accent: "red", sub: "Logout" },
  end: { shape: "pill", accent: "green", sub: "Loop" },
};

// ─── Signal detection ─────────────────────────────────────────────────────

interface DetectedSignals {
  isLanding: boolean;
  isAuth: boolean;
  isLogout: boolean;
  isValidation: boolean;
  isApi: boolean;
  isDatabase: boolean;
  isCrudCreate: boolean;
  isCrudRead: boolean;
  isCrudUpdate: boolean;
  isCrudDelete: boolean;
  routePath: string | null;
  decisions: string[];
  /** detected data-storing actions with descriptive labels */
  storageActions: StorageAction[];
}

interface StorageAction {
  /** what the user is doing, e.g. "register", "create project" */
  trigger: string;
  /** descriptive label for the DB node, e.g. "auth profile created" */
  dbLabel: string;
  /** edge label connecting the decision/action to the DB node */
  edgeLabel: string;
}

function detectSignals(mod: ParsedModule): DetectedSignals {
  const src = mod.source.toLowerCase();
  const path = mod.path.toLowerCase();

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

  const isCrudCreate = /create|insert|add|post/.test(src) && isApi;
  const isCrudRead = /get|find|fetch|select|read/.test(src) && isApi;
  const isCrudUpdate = /update|edit|patch|put/.test(src) && isApi;
  const isCrudDelete = /delete|remove|destroy/.test(src) && isApi;

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

  // Detect user decisions: router.push, Link href, conditional navigation
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

  // Detect data-storing actions: when a user decision stores something in the DB
  const storageActions: StorageAction[] = [];
  const has = (kw: string) => src.includes(kw) || path.includes(kw);

  if (isAuth && (has("register") || has("signup") || has("sign up") || has("create"))) {
    storageActions.push({
      trigger: "register",
      dbLabel: "auth profile created",
      edgeLabel: "store profile",
    });
  }
  if (has("project") && (has("create") || has("add") || has("insert") || isCrudCreate)) {
    storageActions.push({
      trigger: "create project",
      dbLabel: "project stored",
      edgeLabel: "save project",
    });
  }
  if (has("post") && (has("create") || has("add") || has("publish") || isCrudCreate)) {
    storageActions.push({
      trigger: "create post",
      dbLabel: "post stored",
      edgeLabel: "save post",
    });
  }
  if (has("comment") && (has("create") || has("add") || has("post") || isCrudCreate)) {
    storageActions.push({
      trigger: "add comment",
      dbLabel: "comment stored",
      edgeLabel: "save comment",
    });
  }
  if (has("upload") && (has("file") || has("image") || has("avatar"))) {
    storageActions.push({
      trigger: "upload file",
      dbLabel: "file stored",
      edgeLabel: "save file",
    });
  }
  if (has("order") && (has("create") || has("place") || has("submit") || isCrudCreate)) {
    storageActions.push({
      trigger: "place order",
      dbLabel: "order stored",
      edgeLabel: "save order",
    });
  }
  if (has("profile") && (has("update") || has("edit") || isCrudUpdate)) {
    storageActions.push({
      trigger: "update profile",
      dbLabel: "profile updated",
      edgeLabel: "update record",
    });
  }
  // Generic fallback: any CRUD create action that doesn't match a specific pattern
  if (isCrudCreate && storageActions.length === 0) {
    storageActions.push({
      trigger: "create",
      dbLabel: "record stored",
      edgeLabel: "save data",
    });
  }

  return {
    isLanding,
    isAuth,
    isLogout,
    isValidation,
    isApi,
    isDatabase,
    isCrudCreate,
    isCrudRead,
    isCrudUpdate,
    isCrudDelete,
    routePath,
    decisions,
    storageActions,
  };
}

// ─── ID generation ────────────────────────────────────────────────────────

let nodeCounter = 0;
let edgeCounter = 0;

function nextNodeId(): string {
  return `j_${++nodeCounter}`;
}
function nextEdgeId(): string {
  return `j_e${++edgeCounter}`;
}
function resetCounters(): void {
  nodeCounter = 0;
  edgeCounter = 0;
}

// ─── Main builder ─────────────────────────────────────────────────────────

/**
 * Build a continuous user-journey flowchart from parsed modules.
 *
 * The graph always contains a Start node, a Landing node, and a Logout node
 * that loops back to Landing. In between, detected auth, validation,
 * decision, action, and database nodes are woven in. Every node has at
 * least one incoming and one outgoing edge — no orphans, no dead-ends.
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
    sourcePath?: string
  ): JourneyNode => {
    const style = STYLE[type];
    const node: JourneyNode = {
      id: nextNodeId(),
      type,
      label,
      sub: style.sub,
      shape: style.shape,
      accent: style.accent,
      col,
      row,
      sourcePath,
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

  // ── Column layout counters ───────────────────────────────────────────
  // Each column tracks how many nodes have been placed in it.
  const colRows = new Map<number, number>();
  const placeInCol = (col: number): number => {
    const row = colRows.get(col) ?? 0;
    colRows.set(col, row + 1);
    return row;
  };

  // ── Fixed skeleton: Start → Landing ──────────────────────────────────
  // Col 0: Start
  // Col 1: Landing page
  // Col 2: Auth
  // Col 3: Validation
  // Col 4: Decisions
  // Col 5: Actions (API)
  // Col 6: Database
  // Col 7: Logout
  // Col 8: End (loops back to Landing)

  const startNode = addNode("start", "Start", 0, placeInCol(0));
  const landingNode = addNode("page", "Landing Page", 1, placeInCol(1));
  addEdge(startNode.id, landingNode.id, "open app");

  // ── Scan modules for journey signals ─────────────────────────────────
  let authNode: JourneyNode | null = null;
  let logoutNode: JourneyNode | null = null;
  const validationNodes: JourneyNode[] = [];
  const decisionNodes: JourneyNode[] = [];
  const actionNodes: JourneyNode[] = [];
  const dbNodes: JourneyNode[] = [];
  const pageNodes: JourneyNode[] = [];
  /** storage action edges: connect actions to their dedicated DB nodes */
  const storageEdges: { dbNode: JourneyNode; edgeLabel: string; trigger: string }[] = [];

  for (const mod of modules) {
    const sig = detectSignals(mod);

    // Auth node
    if (sig.isAuth && !authNode) {
      authNode = addNode("auth", "Auth Login", 2, placeInCol(2), mod.path);
    }

    // Logout node
    if (sig.isLogout && !logoutNode) {
      logoutNode = addNode("logout", "Logout", 7, placeInCol(7), mod.path);
    }

    // Validation nodes
    if (sig.isValidation) {
      const label = sig.isAuth ? "Validate Credentials" : "Validate Input";
      // Avoid duplicate validation labels
      if (!validationNodes.some((v) => v.label === label)) {
        const vNode = addNode("validation", label, 3, placeInCol(3), mod.path);
        validationNodes.push(vNode);
      }
    }

    // Decision nodes (from navigation links / router.push)
    if (sig.decisions.length > 0 && sig.routePath) {
      const label = `Choose: ${sig.routePath}`;
      if (!decisionNodes.some((d) => d.label === label)) {
        const dNode = addNode("decision", label, 4, placeInCol(4), mod.path);
        decisionNodes.push(dNode);
      }
    }

    // Action / API nodes
    if (sig.isApi) {
      let label = "API Action";
      if (sig.isCrudCreate) label = "Create";
      else if (sig.isCrudRead) label = "Read";
      else if (sig.isCrudUpdate) label = "Update";
      else if (sig.isCrudDelete) label = "Delete";
      if (!actionNodes.some((a) => a.label === label)) {
        const aNode = addNode("action", label, 5, placeInCol(5), mod.path);
        actionNodes.push(aNode);
      }
    }

    // Storage action DB nodes — when a user decision stores data, create a
    // dedicated DB node with a descriptive label (e.g. "auth profile created",
    // "project stored") and connect the action → DB with a labeled edge.
    for (const sa of sig.storageActions) {
      if (!dbNodes.some((d) => d.label === sa.dbLabel)) {
        const dbNode = addNode("database", sa.dbLabel, 6, placeInCol(6), mod.path);
        dbNodes.push(dbNode);
        // Track which action node this storage connects to
        storageEdges.push({ dbNode, edgeLabel: sa.edgeLabel, trigger: sa.trigger });
      }
    }

    // Database nodes
    if (sig.isDatabase) {
      const filename = mod.path.split("/").pop()?.replace(/\.\w+$/, "") || "Database";
      const label = `DB: ${filename}`;
      if (!dbNodes.some((d) => d.label === label)) {
        const dbNode = addNode("database", label, 6, placeInCol(6), mod.path);
        dbNodes.push(dbNode);
      }
    }

    // Additional page nodes (non-landing routes)
    if (sig.routePath && !sig.isLanding && !sig.isAuth && !sig.isLogout) {
      if (!pageNodes.some((p) => p.label === sig.routePath) && !sig.isApi) {
        const pNode = addNode("page", sig.routePath, 4, placeInCol(4), mod.path);
        pageNodes.push(pNode);
      }
    }
  }

  // ── Weave the skeleton together ─────────────────────────────────────
  //
  // Start → Landing → (Auth?) → (Validation?) → (Decisions/Pages?) →
  // (Actions?) → (Database?) → (Logout?) → End → Landing (loop)
  //
  // Every node must have an incoming and outgoing edge.

  // Landing → Auth (or skip to decisions if no auth)
  let lastNode = landingNode;

  if (authNode) {
    addEdge(landingNode.id, authNode.id, "needs login");
    lastNode = authNode;
  }

  // Auth → Validation (credential check)
  if (validationNodes.length > 0 && authNode) {
    const credValidation = validationNodes.find((v) => v.label === "Validate Credentials");
    if (credValidation) {
      addEdge(authNode.id, credValidation.id, "check");
      // Validation success → continue; failure → back to Auth
      addEdge(credValidation.id, authNode.id, "fail → retry");
      lastNode = credValidation;
    }
  }

  // Last node → Decisions / Pages
  const decisionAndPages = [...decisionNodes, ...pageNodes];
  if (decisionAndPages.length > 0) {
    // Connect last node to the first decision/page
    addEdge(lastNode.id, decisionAndPages[0].id, "browse");

    // Chain decisions/pages together
    for (let i = 0; i < decisionAndPages.length - 1; i++) {
      addEdge(decisionAndPages[i].id, decisionAndPages[i + 1].id, "navigate");
    }

    // Each decision branches to actions if they exist
    for (const decision of decisionAndPages) {
      if (actionNodes.length > 0) {
        // Connect decision to the first matching action
        addEdge(decision.id, actionNodes[0].id, "select");
      }
    }

    lastNode = decisionAndPages[decisionAndPages.length - 1];
  }

  // Actions → Database
  if (actionNodes.length > 0) {
    // Chain actions together
    for (let i = 0; i < actionNodes.length - 1; i++) {
      addEdge(actionNodes[i].id, actionNodes[i + 1].id, "next");
    }

    // Each action → database
    for (const action of actionNodes) {
      if (dbNodes.length > 0) {
        addEdge(action.id, dbNodes[0].id, "query");
      }
    }

    // Storage action edges: connect specific actions to their dedicated DB nodes
    // with descriptive labels (e.g. "store profile", "save project")
    for (const se of storageEdges) {
      // Find the matching action node (Create action for create-type triggers)
      const matchingAction = actionNodes.find((a) => {
        if (se.trigger === "update profile") return a.label === "Update";
        return a.label === "Create";
      });
      if (matchingAction) {
        addEdge(matchingAction.id, se.dbNode.id, se.edgeLabel);
      } else if (actionNodes.length > 0) {
        // No specific match — connect from the first action
        addEdge(actionNodes[0].id, se.dbNode.id, se.edgeLabel);
      } else {
        // No actions at all — connect from the last decision/page directly to DB
        if (decisionAndPages.length > 0) {
          addEdge(decisionAndPages[0].id, se.dbNode.id, se.edgeLabel);
        } else {
          addEdge(lastNode.id, se.dbNode.id, se.edgeLabel);
        }
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

  // Input validation (non-credential) — connect after decisions, before actions
  const inputValidations = validationNodes.filter((v) => v.label !== "Validate Credentials");
  for (const v of inputValidations) {
    // Connect from the last decision/page to validation
    if (decisionAndPages.length > 0) {
      addEdge(decisionAndPages[0].id, v.id, "submit");
      // Validation → action (success path)
      if (actionNodes.length > 0) {
        addEdge(v.id, actionNodes[0].id, "valid");
      } else {
        // No actions — connect to logout or end
        addEdge(v.id, logoutNode?.id ?? lastNode.id, "valid");
      }
    }
  }

  // → Logout
  if (logoutNode) {
    addEdge(lastNode.id, logoutNode.id, "session end");
    lastNode = logoutNode;
  }

  // End node — loops back to Landing
  const endNode = addNode("end", "Loop", 8, placeInCol(8));
  addEdge(lastNode.id, endNode.id, "complete");
  addEdge(endNode.id, landingNode.id, "restart");

  // ── Orphan insurance: ensure every node has ≥1 in and ≥1 out edge ──
  const hasIncoming = new Set<string>();
  const hasOutgoing = new Set<string>();
  for (const e of edges) {
    hasOutgoing.add(e.from);
    hasIncoming.add(e.to);
  }

  for (const node of nodes) {
    if (node.type === "start") continue; // start has no incoming by design

    if (!hasIncoming.has(node.id)) {
      // Connect from the nearest previous-column node
      const prev = nodes
        .filter((n) => n.col < node.col)
        .sort((a, b) => b.col - a.col)[0];
      if (prev) {
        addEdge(prev.id, node.id, "flow");
        hasOutgoing.add(prev.id);
        hasIncoming.add(node.id);
      } else {
        // No previous column — connect from start
        addEdge(startNode.id, node.id, "flow");
        hasIncoming.add(node.id);
      }
    }

    if (!hasOutgoing.has(node.id) && node.type !== "end") {
      // Connect to the nearest next-column node, or to end
      const next = nodes
        .filter((n) => n.col > node.col && n.type !== "end")
        .sort((a, b) => a.col - b.col)[0];
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
