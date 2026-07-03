/**
 * Architecture Decision Engine
 *
 * A lightweight, zero-knowledge file categorization engine that classifies
 * every source file into one of three architectural layers and generates
 * relationship edges between them.
 *
 * Decision 1 (Routing):  /app/ or /pages/ in path  → UI_NODE
 * Decision 2 (Database): prisma | schema | model   → DB_NODE
 * Decision 3 (API/Logic): api | server | controller → LOGIC_NODE
 * Decision 4 (Relationship): UI → LOGIC → DB edges based on fetch/API calls
 *
 * Files that match none of the rules are left uncategorized and excluded
 * from the graph (they carry no architectural signal).
 */

import type { ParsedModule } from "./ast-parser";
import type { Shape } from "./canvas-geometry";

export type ArchCategory = "UI_NODE" | "DB_NODE" | "LOGIC_NODE";

export interface ArchNode {
  id: string;
  category: ArchCategory;
  label: string;
  sub: string;
  path: string;
  shape: Shape;
  accent: "green" | "teal" | "blue" | "purple" | "orange" | "red";
}

export interface ArchEdge {
  id: string;
  from: string;
  to: string;
  label: string;
}

export interface ArchGraph {
  nodes: ArchNode[];
  edges: ArchEdge[];
}

// ─── Category visual mapping ──────────────────────────────────────────────

export const CATEGORY_STYLE: Record<
  ArchCategory,
  { shape: Shape; accent: ArchNode["accent"]; sub: string }
> = {
  UI_NODE: { shape: "pill", accent: "green", sub: "UI / Route" },
  LOGIC_NODE: { shape: "rectangle", accent: "orange", sub: "API / Logic" },
  DB_NODE: { shape: "cylinder", accent: "blue", sub: "Database / Schema" },
};

// ─── Decision rules ────────────────────────────────────────────────────────

const UI_PATH_PATTERNS = ["/app/", "/pages/", "app/", "pages/"];
const DB_KEYWORDS = ["prisma", "schema", "model"];
const LOGIC_KEYWORDS = ["api", "server", "controller"];

/**
 * Classify a single file into an architectural category.
 * Returns null if no rule matches.
 *
 * The rules are evaluated in priority order: UI > DB > LOGIC. A file under
 * /app/ that also mentions "schema" is a UI node (the path is the stronger
 * signal). A file outside /app/ and /pages/ that mentions "prisma" is a DB
 * node. A file outside both UI and DB paths that mentions "api" is a LOGIC
 * node.
 */
export function classifyFile(path: string, content: string): ArchCategory | null {
  const lowerPath = path.toLowerCase();
  const lowerContent = content.toLowerCase();

  // Decision 1: Routing — path-based, strongest signal
  if (UI_PATH_PATTERNS.some((p) => lowerPath.includes(p))) {
    return "UI_NODE";
  }

  // Decision 3 (path): API/Logic by path — path is a stronger signal than content
  if (LOGIC_KEYWORDS.some((kw) => lowerPath.includes(kw))) {
    return "LOGIC_NODE";
  }

  // Decision 2 (path): Database by path
  if (DB_KEYWORDS.some((kw) => lowerPath.includes(kw))) {
    return "DB_NODE";
  }

  // Decision 2 (content): Database by content
  if (DB_KEYWORDS.some((kw) => lowerContent.includes(kw))) {
    return "DB_NODE";
  }

  // Decision 3 (content): API/Logic by content
  if (LOGIC_KEYWORDS.some((kw) => lowerContent.includes(kw))) {
    return "LOGIC_NODE";
  }

  return null;
}

// ─── Label helpers ─────────────────────────────────────────────────────────

function fileLabel(path: string): string {
  const parts = path.split("/");
  const filename = parts[parts.length - 1] || path;
  return filename.replace(/\.(tsx|ts|js|jsx|mjs|cjs|py|rb|go|rs|java|kt)$/, "");
}

function routeLabel(path: string): string {
  const appMatch = path.match(/(?:^|\/)app\/(.+?)\/page\.(?:tsx|ts|js|jsx)$/);
  if (appMatch) return `/${appMatch[1]}`;
  const pagesMatch = path.match(/(?:^|\/)pages\/(.+?)\.(?:tsx|ts|js|jsx)$/);
  if (pagesMatch) {
    const seg = pagesMatch[1].replace(/\[|\]/g, ":").replace(/\/index$/, "");
    return `/${seg}`;
  }
  return fileLabel(path);
}

// ─── Fetch/API call detection for edge generation ──────────────────────────

const FETCH_PATTERNS: RegExp[] = [
  /fetch\s*\(\s*['"`]([^'"`]+)['"`]/g,
  /axios\s*\.\s*(?:get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]/g,
  /(?:api|endpoint)\s*[:=]\s*['"`]([^'"`]+)['"`]/g,
];

interface DetectedApiCall {
  endpoint: string;
  line: number;
}

function detectApiCalls(content: string): DetectedApiCall[] {
  const calls: DetectedApiCall[] = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const pattern of FETCH_PATTERNS) {
      const re = new RegExp(pattern.source, pattern.flags);
      let match: RegExpExecArray | null;
      while ((match = re.exec(line)) !== null) {
        const endpoint = match[1];
        if (endpoint && !endpoint.startsWith("http://") && !endpoint.startsWith("https://")) {
          calls.push({ endpoint, line: i + 1 });
        }
      }
    }
  }

  return calls;
}

/**
 * Normalize an API endpoint to a file path for matching.
 * e.g. "/api/users" → "api/users"
 */
function normalizeEndpoint(endpoint: string): string {
  return endpoint.replace(/^\/+/, "").toLowerCase();
}

// ─── Main engine ───────────────────────────────────────────────────────────

let nodeCounter = 0;
let edgeCounter = 0;

function nextNodeId(): string {
  return `arch_${++nodeCounter}`;
}
function nextEdgeId(): string {
  return `arch_e${++edgeCounter}`;
}

function resetCounters(): void {
  nodeCounter = 0;
  edgeCounter = 0;
}

/**
 * Run the Architecture Decision Engine over a set of parsed modules.
 *
 * Produces a graph of categorized nodes (UI_NODE, DB_NODE, LOGIC_NODE) and
 * edges representing data flow (UI → LOGIC, LOGIC → DB, UI → DB direct).
 */
export function buildArchGraph(modules: ParsedModule[]): ArchGraph {
  resetCounters();

  const nodes: ArchNode[] = [];
  const edges: ArchEdge[] = [];
  const nodeByPath = new Map<string, ArchNode>();

  // ── Pass 1: Classify every file ──────────────────────────────────────
  for (const mod of modules) {
    const category = classifyFile(mod.path, mod.source);
    if (!category) continue;

    const style = CATEGORY_STYLE[category];
    const label =
      category === "UI_NODE" ? routeLabel(mod.path) : fileLabel(mod.path);

    const node: ArchNode = {
      id: nextNodeId(),
      category,
      label,
      sub: style.sub,
      path: mod.path,
      shape: style.shape,
      accent: style.accent,
    };

    nodes.push(node);
    nodeByPath.set(mod.path, node);
  }

  // ── Pass 2: Generate edges based on API calls ────────────────────────
  // Build lookup of LOGIC_NODE paths by normalized path segment
  const logicNodesBySegment = new Map<string, ArchNode[]>();
  for (const node of nodes) {
    if (node.category === "LOGIC_NODE") {
      const segment = normalizeEndpoint(node.path.replace(/^.*\//, ""));
      const key = segment || normalizeEndpoint(node.path);
      const arr = logicNodesBySegment.get(key) ?? [];
      arr.push(node);
      logicNodesBySegment.set(key, arr);
    }
  }

  // Also index DB nodes by label for LOGIC → DB linking
  const dbNodesByLabel = new Map<string, ArchNode[]>();
  for (const node of nodes) {
    if (node.category === "DB_NODE") {
      const key = node.label.toLowerCase();
      const arr = dbNodesByLabel.get(key) ?? [];
      arr.push(node);
      dbNodesByLabel.set(key, arr);
    }
  }

  const edgeExists = new Set<string>();
  const addEdge = (from: ArchNode, to: ArchNode, label: string) => {
    const dedupeKey = `${from.id}→${to.id}→${label}`;
    if (edgeExists.has(dedupeKey)) return;
    edgeExists.add(dedupeKey);
    edges.push({ id: nextEdgeId(), from: from.id, to: to.id, label });
  };

  for (const mod of modules) {
    const sourceNode = nodeByPath.get(mod.path);
    if (!sourceNode) continue;

    // Decision 4a: UI_NODE → LOGIC_NODE (via fetch/api calls)
    if (sourceNode.category === "UI_NODE") {
      const apiCalls = detectApiCalls(mod.source);
      for (const call of apiCalls) {
        const normalized = normalizeEndpoint(call.endpoint);
        // Match against logic node path segments
        const matched = logicNodesBySegment.get(normalized);
        if (matched && matched.length > 0) {
          addEdge(sourceNode, matched[0], "fetch");
        } else {
          // Fuzzy match: find logic nodes whose path contains the endpoint segment
          const seg = normalized.split("/").pop() ?? normalized;
          for (const node of nodes) {
            if (node.category === "LOGIC_NODE" && node.path.toLowerCase().includes(seg)) {
              addEdge(sourceNode, node, "fetch");
              break;
            }
          }
        }
      }
    }

    // Decision 4b: LOGIC_NODE → DB_NODE (if logic file mentions DB keywords)
    if (sourceNode.category === "LOGIC_NODE") {
      const lowerSource = mod.source.toLowerCase();
      for (const [dbLabel, dbNodes] of dbNodesByLabel) {
        if (lowerSource.includes(dbLabel)) {
          addEdge(sourceNode, dbNodes[0], "query");
        }
      }
    }

    // Decision 4c: UI_NODE → DB_NODE (direct client-side DB call, e.g. Supabase)
    if (sourceNode.category === "UI_NODE") {
      const lowerSource = mod.source.toLowerCase();
      if (
        lowerSource.includes("supabase") ||
        lowerSource.includes("prisma.") ||
        lowerSource.includes("mongoose")
      ) {
        for (const [dbLabel, dbNodes] of dbNodesByLabel) {
          if (lowerSource.includes(dbLabel)) {
            addEdge(sourceNode, dbNodes[0], "direct query");
          }
        }
      }
    }
  }

  return { nodes, edges };
}
