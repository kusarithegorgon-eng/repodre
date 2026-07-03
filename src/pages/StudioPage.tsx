import { Link, useSearch } from "@tanstack/react-router";
import { useMemo, useState, useEffect, useCallback, useRef, type CSSProperties } from "react";
import { ChevronDown, ChevronRight, File as FileIcon, FileCode2, Folder, FolderOpen, Magnet, Minus, Plus, Settings2, Sparkles, Spline, Trash2, X, Loader as Loader2, Download, Upload, LayoutGrid as Layout, CornerDownRight, Activity, TriangleAlert as AlertTriangle, Cloud, Server, Shield, Key } from "lucide-react";
import { RepodreLogo } from "@/components/RepodreLogo";
import { AuthButton } from "@/components/AuthButton";
import { NodeShapeSVG, ShapeIcon } from "@/components/NodeShapeSVG";
import { WorkspaceSwitcher } from "@/components/WorkspaceSwitcher";
import { ErdCanvas } from "@/components/ErdCanvas";
import { SchemaInput } from "@/components/SchemaInput";
import { ExportSchemaButton } from "@/components/ExportSchemaButton";
import { ThemeToggle } from "@/components/ThemeToggle";
import { PrivacyShield } from "@/components/PrivacyShield";
import { ApiTestExportButton } from "@/components/ApiTestExportButton";
import { CodePreviewPanel, CodePreviewToggle } from "@/components/CodePreviewPanel";
import { BottleneckBadge } from "@/components/BottleneckBadge";
import { EditableLabel } from "@/components/InlineLabelEditor";
import { DragToConnectHandle, LiveEdgeDrawing, useDragToConnect } from "@/components/DragToConnectHandles";
import { NodeSpawnerPopover, useNodeSpawner, createNewNodeConfig } from "@/components/NodeSpawnerPopover";
import {
  SimulationMode,
  SimulationModeToggle,
} from "@/components/SimulationMode";
import {
  SystemInsightsDashboard,
  SystemInsightsToggle,
} from "@/components/SystemInsightsDashboard";
import { useCanvasPan, RecenterButton } from "@/hooks/useCanvasPan.tsx";
import { analyzeBottlenecks, type BottleneckWarning } from "@/lib/bottleneck-analyzer";
import type { DetectedController } from "@/lib/blueprint-analyzer";
import type { ParsedModule } from "@/lib/ast-parser";
import { AstTokenizerInspector, AstTokenizerToggle } from "@/components/AstTokenizerInspector";
import { TimeTravelTracer } from "@/components/TimeTravelTracer";
import { calculateComplexityForNode, getComplexityColor, getComplexityBg, type ComplexityResult } from "@/lib/cyclomatic-complexity";
import { buildCrossReferences, type CrossReferenceLink } from "@/lib/cross-reference-engine";
import { generateScaffold, downloadScaffold } from "@/lib/scaffold-exporter";
import { detectAntiPatterns, type AntiPatternWarning, getWarningsForNode, hasViewToDbBypass } from "@/lib/anti-pattern-detector";
import { scanForEnvVariables, type EnvScanResult, getEnvVarsForNode } from "@/lib/env-scanner";
import { EnvironmentToggle, useProductionOverlay, type Environment } from "@/components/EnvironmentToggle";
import { WebhookSyncPanel, WebhookSyncToggle, useWebhookSync } from "@/components/WebhookSyncPanel";
import { MultiplayerPresence, MultiplayerToggle, GhostCursors, useMultiplayerPresence } from "@/components/MultiplayerPresence";
import { GitDiffOverlay, GitDiffToggle, useGitDiff, getDiffNodeStyles } from "@/components/GitDiffOverlay";
import { ControllerBadge, isControllerNode, classifyNodeLayer, useSmartLinks, getSmartLinkClasses } from "@/components/Flow";
import type { WebhookEvent, NodeMutation } from "@/lib/webhook-sync";
import type { SmartLinkEdge } from "@/components/Flow";
import type { DiffStatus } from "@/lib/git-diff-engine";
import { getNodeDiffStatus } from "@/lib/git-diff-engine";
import {
  NODE_W,
  NODE_H,
  type Shape,
  type HandleSegment,
  type PositionedNode,
  anchorHandles,
  centerOf,
  paddingFor,
  perimeterPoint,
  routeEdge,
  snappedEdgePath,
  textMaxWidth,
} from "@/lib/canvas-geometry";
import {
  loadFullProject,
  loadGraphFromDatabase,
  updateNode,
  updateProject,
  createProject,
  createNode,
  createEdge,
  deleteNode,
  deleteEdge,
  batchCreateNodes,
  batchCreateEdges,
  type Project,
  type Workspace,
  type Edge,
} from "@/lib/db-client";
import { detectCardinality, type ParsedTable } from "@/lib/sql-tokenizer";
import { useEdgeSnap } from "@/hooks/useEdgeSnap";

// ─── Types ─────────────────────────────────────────────────────────────────

type Accent = "green" | "purple" | "teal" | "blue" | "orange" | "red";

interface NodeData extends PositionedNode {
  id: string;
  label: string;
  sub: string;
  shape: Shape;
  accent: Accent;
  x: number;
  y: number;
  workspace: Workspace;
  columns?: import("@/lib/db-client").ErdColumnRow[] | null;
  tableName?: string | null;
  isManuallyPositioned?: boolean;
  parseError?: string | null;
}

type WireStyle = "curvy" | "straight" | "orthogonal";

const GRID_SNAP = 20;
const snapToGrid = (v: number) => Math.round(v / GRID_SNAP) * GRID_SNAP;
const CANVAS_STORAGE_KEY = "repodre-canvas-v1";

function parseLayoutDirectives(text: string): { direction: "LR" | "TB"; gapX: number; gapY: number } {
  const result: { direction: "LR" | "TB"; gapX: number; gapY: number } = { direction: "LR", gapX: 280, gapY: 160 };
  for (const part of text.split(",")) {
    const [k, v] = part.split(":").map((s) => s.trim());
    if (k === "direction" && (v === "LR" || v === "TB")) result.direction = v;
    if (k === "gap-x" && !isNaN(+v)) result.gapX = +v;
    if (k === "gap-y" && !isNaN(+v)) result.gapY = +v;
  }
  return result;
}

function straightEdgePath(a: NodeData, b: NodeData): string {
  const ac = centerOf(a);
  const bc = centerOf(b);
  const ap = perimeterPoint(a, bc.x, bc.y);
  const bp = perimeterPoint(b, ac.x, ac.y);
  return `M ${ap.x} ${ap.y} L ${bp.x} ${bp.y}`;
}

function orthogonalEdgePath(a: NodeData, b: NodeData): string {
  const ac = centerOf(a);
  const bc = centerOf(b);
  const ap = perimeterPoint(a, bc.x, bc.y);
  const bp = perimeterPoint(b, ac.x, ac.y);
  const midX = (ap.x + bp.x) / 2;
  return `M ${ap.x} ${ap.y} H ${midX} V ${bp.y} H ${bp.x}`;
}

interface EdgeData {
  id: string;
  from: string;
  to: string;
  fromHandle?: HandleSegment;
  toHandle?: HandleSegment;
  cardinality?: "one-to-one" | "one-to-many";
  fromColumn?: string;
  toColumn?: string;
}

// ─── Design tokens - HIGH-CONTRAST ACADEMIC PALETTE ───────────────────────

const ACCENT: Record<Accent, { color: string; glow: string; label: string; nodeType: import("@/components/NodeShapeSVG").NodeType }> = {
  green:  { color: "var(--node-view-stroke)",  glow: "transparent", label: "View/Endpoint", nodeType: "view" },
  purple: { color: "var(--node-validation-stroke)", glow: "transparent", label: "Validation", nodeType: "validation" },
  teal:   { color: "var(--node-controller-stroke)", glow: "transparent", label: "Controller", nodeType: "controller" },
  blue:   { color: "var(--node-database-stroke)", glow: "transparent", label: "Database", nodeType: "database" },
  orange: { color: "var(--node-gateway-stroke)", glow: "transparent", label: "Gateway", nodeType: "gateway" },
  red:    { color: "var(--node-error-stroke)", glow: "transparent", label: "Error", nodeType: "error" },
};

const ALL_SHAPES: Shape[] = [
  "rectangle",
  "pill",
  "diamond",
  "cylinder",
  "triangle",
  "parallelogram",
  "document",
  "hexagon",
];

// ─── Demo seed data: E-Commerce System ─────────────────────────────────────
// Journey: Landing -> Login -> Validation Diamond -> Role-based Dashboard split
// ERD: Users 1:1 Profiles, Users 1:N Products, Products 1:N Sales

const INITIAL_NODES: NodeData[] = [
  { id: "n1", label: "/ (Landing)",       sub: "View · Entry",      shape: "pill",         accent: "green",  x: 60,   y: 80,  workspace: "app" },
  { id: "n2", label: "/login",            sub: "View · Auth",       shape: "pill",         accent: "green",  x: 60,   y: 240, workspace: "app" },
  { id: "n3", label: "validateLogin()",   sub: "Zod Schema",        shape: "diamond",      accent: "purple", x: 380,  y: 240, workspace: "app" },
  { id: "n4", label: "/api/auth/login",   sub: "POST · Controller", shape: "rectangle",    accent: "teal",   x: 700,  y: 240, workspace: "app" },
  { id: "n5", label: "users",             sub: "Supabase Table",    shape: "cylinder",     accent: "blue",   x: 1020, y: 240, workspace: "app" },
  { id: "n6", label: "/dashboard/manager",sub: "View · Manager",    shape: "pill",         accent: "green",  x: 700,  y: 80,  workspace: "app" },
  { id: "n7", label: "/dashboard/staff",  sub: "View · Staff",      shape: "pill",         accent: "green",  x: 700,  y: 400, workspace: "app" },
  { id: "n8", label: "Show error",        sub: "Validation failure",shape: "triangle",     accent: "red",    x: 380,  y: 400, workspace: "app" },
];

const INITIAL_EDGES: EdgeData[] = [
  { id: "e1", from: "n1", to: "n2" },
  { id: "e2", from: "n2", to: "n3" },
  { id: "e3", from: "n3", to: "n4", fromHandle: "e", toHandle: "w" },
  { id: "e4", from: "n4", to: "n5", fromHandle: "e", toHandle: "w" },
  { id: "e5", from: "n3", to: "n6", fromHandle: "n", toHandle: "w" },
  { id: "e6", from: "n3", to: "n7", fromHandle: "s", toHandle: "w" },
  { id: "e7", from: "n3", to: "n8", fromHandle: "s", toHandle: "n" },
];

// ─── Text layout helper ─────────────────────────────────────────────────────

/**
 * Returns the CSS positioning for the text content box within the
 * node's bounding div (width=NODE_W, height=NODE_H).
 *
 * Each shape defines an inscribed "safe zone" where text is guaranteed
 * to stay inside the visual boundary.
 */
function textLayoutFor(shape: Shape, w = NODE_W, h = NODE_H): CSSProperties {
  const pad = paddingFor(shape);
  const safeW = textMaxWidth(shape, 1, w, h);

  switch (shape) {
    case "pill":
      return {
        position: "absolute",
        left: (w - safeW) / 2,
        top: pad.y,
        width: safeW,
        height: h - pad.y * 2,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      };

    case "diamond": {
      // Inscribed rect in a rhombus: width = hw = w/2, height = hh = h/2
      const iw = w / 2 - pad.x;
      const ih = h / 2 - pad.y;
      return {
        position: "absolute",
        left: (w - iw) / 2,
        top: (h - ih) / 2,
        width: iw,
        height: ih,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      };
    }

    case "cylinder":
      // body area starts after top ellipse cap; shift label down slightly
      return {
        position: "absolute",
        left: pad.x,
        top: pad.y,
        width: w - pad.x * 2,
        height: h - pad.y * 2,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      };

    case "triangle": {
      // Inscribed rect sits in the lower 55% of the triangle
      const ih = h * 0.44;
      const iw = safeW;
      const itop = h * 0.38;
      return {
        position: "absolute",
        left: (w - iw) / 2,
        top: itop,
        width: iw,
        height: ih,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      };
    }

    case "parallelogram": {
      // Center in the parallelogram, accounting for skew on both sides
      const skew = w * 0.18;
      const iw = safeW;
      return {
        position: "absolute",
        left: (w - iw) / 2 + skew * 0.05,
        top: pad.y,
        width: iw,
        height: h - pad.y * 2,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      };
    }

    case "document": {
      // Keep text away from the folded top-right corner (fold ≈ 22px)
      return {
        position: "absolute",
        left: pad.x,
        top: pad.y,
        width: safeW,
        height: h - pad.y * 2,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      };
    }

    default: // rectangle
      return {
        position: "absolute",
        left: pad.x,
        top: pad.y,
        width: w - pad.x * 2,
        height: h - pad.y * 2,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      };
  }
}

// ─── Edge geometry helper ───────────────────────────────────────────────────

function endpointFor(node: NodeData, other: NodeData, handle?: HandleSegment) {
  if (handle) {
    const h = anchorHandles(node).find((x) => x.id === handle);
    if (h) return { x: h.x, y: h.y };
  }
  const c = centerOf(other);
  return perimeterPoint(node, c.x, c.y);
}

// ─── Studio page ────────────────────────────────────────────────────────────

export function StudioPage() {
  const search = useSearch({ strict: false }) as { demo?: boolean; draft?: boolean; project?: string };
  const isDemoMode = search?.demo === true;
  const isDraftMode = search?.draft === true;
  const [isLoading, setIsLoading] = useState(!isDemoMode);
  const [project, setProject] = useState<Project | null>(null);
  const [workspace, setWorkspace] = useState<Workspace>("app");
  const [nodes, setNodes] = useState<NodeData[]>(INITIAL_NODES);
  const [edges, setEdges] = useState<EdgeData[]>(INITIAL_EDGES);
  const [selected, setSelected] = useState<string | null>("n1");
  const [autoLayout, setAutoLayout] = useState(true);
  const [smartRoute, setSmartRoute] = useState(true);
  const [zoom, setZoom] = useState(100);
  const [hoverHandle, setHoverHandle] = useState<string | null>(null);
  const [schemaSource, setSchemaSource] = useState<string>("");
  const [codePreviewOpen, setCodePreviewOpen] = useState(false);
  const [bottleneckWarnings, setBottleneckWarnings] = useState<BottleneckWarning[]>([]);
  const [simulationOpen, setSimulationOpen] = useState(false);
  const [insightsOpen, setInsightsOpen] = useState(false);
  const [highlightedNodeId, setHighlightedNodeId] = useState<string | null>(null);
  const [highlightedEdgeIds, setHighlightedEdgeIds] = useState<string[]>([]);
  const [wireStyle, setWireStyle] = useState<WireStyle>("curvy");
  const [layoutDirectives, setLayoutDirectives] = useState("direction: LR, gap-x: 280, gap-y: 160");
  const [showLayoutPopover, setShowLayoutPopover] = useState(false);
  const [astInspectorOpen, setAstInspectorOpen] = useState(false);
  const [tracerActive, setTracerActive] = useState(false);
  const [liveTrafficActive, setLiveTrafficActive] = useState(false);
  const [crossRefLinks, setCrossRefLinks] = useState<CrossReferenceLink[]>([]);
  const [environment, setEnvironment] = useState<Environment>("local");
  const [antiPatternWarnings, setAntiPatternWarnings] = useState<AntiPatternWarning[]>([]);
  const [webhookSyncOpen, setWebhookSyncOpen] = useState(false);
  const [multiplayerOpen, setMultiplayerOpen] = useState(false);
  const [gitDiffOpen, setGitDiffOpen] = useState(false);
  const [lastWebhookEvent, setLastWebhookEvent] = useState<WebhookEvent | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── Infinite Canvas Pan Engine ─────────────────────────────────────────────
  const canvasPan = useCanvasPan({
    enableSpacebar: true,
    enableMiddleMouse: true,
  });

  // ─── 30% Manual Override: Canvas interaction state ───────────────────────
  const canvasRef = useRef<HTMLDivElement>(null);
  const [nodeIdCounter, setNodeIdCounter] = useState(1000);
  const [edgeIdCounter, setEdgeIdCounter] = useState(1000);

  // Drag-to-connect hook
  const dragToConnect = useDragToConnect({
    nodes: nodes.map((n) => ({ ...n, w: n.w ?? NODE_W, h: n.h ?? NODE_H })),
    zoom: zoom / 100,
    canvasRef,
    onConnect: useCallback((fromId, fromHandle, toId, toHandle) => {
      const newEdge: EdgeData = {
        id: `edge_${edgeIdCounter}`,
        from: fromId,
        to: toId,
        fromHandle,
        toHandle,
      };
      setEdges((prev) => [...prev, newEdge]);
      setEdgeIdCounter((c) => c + 1);
      // Persist to DB (fire-and-forget)
      createEdge(project?.id ?? "demo", newEdge).catch(() => {});
    }, [edgeIdCounter, project?.id]),
  });

  // Node spawner hook
  const nodeSpawner = useNodeSpawner({
    canvasRef,
    zoom: zoom / 100,
    onSpawnNode: useCallback((type, position) => {
      const config = createNewNodeConfig(type, position);
      const newNode: NodeData = {
        id: `node_${nodeIdCounter}`,
        label: config.label,
        sub: config.sub,
        shape: config.shape,
        accent: config.accent,
        x: config.x,
        y: config.y,
        workspace,
      };
      setNodes((prev) => [...prev, newNode]);
      setNodeIdCounter((c) => c + 1);
      setSelected(newNode.id);
      // Persist to DB (fire-and-forget)
      createNode(project?.id ?? "demo", newNode).catch(() => {});
    }, [nodeIdCounter, workspace, project?.id]),
  });

  // Mock controllers and modules for API test export (demo)
  const mockControllers: DetectedController[] = useMemo(() => [
    { key: "/api/auth/login", label: "/api/auth/login", path: "app/api/auth/login/route.ts", methods: ["POST"] },
    { key: "/api/auth/logout", label: "/api/auth/logout", path: "app/api/auth/logout/route.ts", methods: ["POST"] },
    { key: "/api/users", label: "/api/users", path: "app/api/users/route.ts", methods: ["GET", "POST"] },
  ], []);

  const mockModules: ParsedModule[] = useMemo(() => [
    {
      path: "app/api/auth/login/route.ts",
      source: `import { z } from "zod";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export async function POST(req: Request) {
  const body = await req.json();
  const validated = loginSchema.parse(body);

  // Simulated synchronous bottleneck: multiple DB operations
  await supabase.from("users").select("*").eq("email", validated.email);
  await supabase.from("sessions").insert({ userId: user.id });
  await supabase.from("audit_log").insert({ action: "login" });

  // Synchronous payment check
  const subscription = await stripe.customers.retrieve(user.stripeId);

  // Synchronous email dispatch
  await sendgrid.send({ to: user.email, template: "login-notify" });

  return Response.json({ success: true });
}`,
      imports: [],
      exports: [],
    },
  ], []);

  // Detect infrastructure and bottlenecks on mount
  useEffect(() => {
    const analysis = analyzeBottlenecks(mockModules);
    setBottleneckWarnings(analysis.warnings);
  }, [mockModules]);

  // Compute cross-reference links between controllers and database tables
  useEffect(() => {
    const xrefResult = buildCrossReferences(
      nodes.map((n) => ({
        id: n.id,
        label: n.label,
        sub: n.sub,
        shape: n.shape,
        tableName: n.tableName,
      })),
      mockModules,
    );
    setCrossRefLinks(xrefResult.links);
  }, [nodes, mockModules]);

  // Detect architectural anti-patterns
  useEffect(() => {
    const result = detectAntiPatterns(
      nodes.map((n) => ({
        id: n.id,
        label: n.label,
        sub: n.sub,
        shape: n.shape,
      })),
      edges.map((e) => ({
        id: e.id,
        from: e.from,
        to: e.to,
      }))
    );
    setAntiPatternWarnings(result.warnings);
  }, [nodes, edges]);

  // Compute production overlay nodes (read replicas, firewall gates)
  const productionOverlayNodes = useProductionOverlay(nodes, environment);

  // Webhook sync handler
  const handleWebhookMutations = useCallback((mutations: NodeMutation[]) => {
    for (const mutation of mutations) {
      if (mutation.type === "add" && mutation.newNode) {
        const newNode: NodeData = {
          id: mutation.newNode.id,
          label: mutation.newNode.label,
          sub: mutation.newNode.sub,
          shape: mutation.newNode.shape as Shape,
          accent: mutation.newNode.accent as Accent,
          x: mutation.newNode.x,
          y: mutation.newNode.y,
          workspace: mutation.newNode.workspace as Workspace,
          isManuallyPositioned: false,
        };
        setNodes((prev) => [...prev, newNode]);
      } else if (mutation.type === "delete") {
        setNodes((prev) => prev.filter((n) => n.id !== mutation.nodeId));
      }
    }
  }, []);

  const webhookSync = useWebhookSync(nodes, handleWebhookMutations);

  // Multiplayer presence
  const {
    presenceState,
    toggleConnection: togglePresenceConnection,
  } = useMultiplayerPresence(canvasRef, zoom, nodes);

  // Git diff
  const {
    diffResult,
    generateDiff,
    clearDiff,
  } = useGitDiff(nodes);

  // Update last webhook event when connected
  useEffect(() => {
    if (webhookSync.isConnected) {
      webhookSync.triggerMockEvent();
    }
  }, [webhookSync.isConnected]);

  // Project IDs for the two demo workspaces
  const APP_PROJECT_ID = "00000000-0000-0000-0000-000000000001";
  const ERD_PROJECT_ID = "00000000-0000-0000-0000-000000000002";

  // Load the project for the active workspace
  useEffect(() => {
    // Demo mode: instantly hydrate from static seed data, skip all DB fetches
    if (isDemoMode) {
      setNodes(INITIAL_NODES);
      setEdges(INITIAL_EDGES);
      setIsLoading(false);
      return;
    }

    // Draft mode: load analysis result from sessionStorage (unauthenticated flow)
    if (isDraftMode) {
      try {
        const raw = sessionStorage.getItem("repodre-draft-graph");
        if (raw) {
          const draft = JSON.parse(raw) as {
            nodes: Array<{ id: string; label: string; sub: string; shape: Shape; accent: Accent; x: number; y: number }>;
            edges: Array<{ id: string; from: string; to: string; fromHandle?: string; toHandle?: string }>;
            repoName: string;
          };
          setNodes(draft.nodes.map((n) => ({ ...n, workspace: "app" as Workspace })));
          setEdges(draft.edges.map((e) => ({
            id: e.id,
            from: e.from,
            to: e.to,
            fromHandle: e.fromHandle as HandleSegment | undefined,
            toHandle: e.toHandle as HandleSegment | undefined,
          })));
        }
      } catch { /* ignore parse errors */ }
      setIsLoading(false);
      return;
    }

    async function loadProject() {
      setIsLoading(true);
      setSelected(null);
      // Use explicit project ID from URL, or fall back to demo project
      const projectId = search.project ?? (workspace === "app" ? APP_PROJECT_ID : ERD_PROJECT_ID);
      try {
        const graphData = await loadGraphFromDatabase(projectId);
        if (graphData) {
          setProject(graphData.project);
          setNodes(
            graphData.nodes.map((n) => ({
              id: n.id,
              label: n.label,
              sub: n.sub,
              shape: n.shape as Shape,
              accent: n.accent as Accent,
              x: n.x,
              y: n.y,
              w: n.w,
              h: n.h,
              workspace: n.workspace,
              columns: n.columns,
              tableName: n.tableName,
            }))
          );
          setEdges(
            graphData.edges.map((e) => ({
              id: e.id,
              from: e.from,
              to: e.to,
              fromHandle: e.fromHandle,
              toHandle: e.toHandle,
              cardinality: e.cardinality,
              fromColumn: e.fromColumn,
              toColumn: e.toColumn,
            }))
          );
          if (graphData.project) {
            setZoom(graphData.project.zoom);
            setAutoLayout(graphData.project.autoLayout);
            setSmartRoute(graphData.project.smartRoute);
            setSchemaSource(graphData.project.schemaSource ?? "");
          }
        } else if (search.project) {
          // Specified project not found — fall back to demo data
          setNodes(INITIAL_NODES);
          setEdges(INITIAL_EDGES);
        }
      } catch (err) {
        console.error("DB load failed, using demo data:", err);
        setNodes(INITIAL_NODES);
        setEdges(INITIAL_EDGES);
      } finally {
        setIsLoading(false);
      }
    }
    loadProject();
  }, [workspace, APP_PROJECT_ID, ERD_PROJECT_ID, isDemoMode, isDraftMode, search.project]);

  const sel = nodes.find((n) => n.id === selected) ?? null;

  const setShape = useCallback(async (id: string, shape: Shape) => {
    setNodes((p) => p.map((n) => (n.id === id ? { ...n, shape } : n)));
    try { await updateNode(id, { shape }); } catch { /* ignore */ }
  }, []);

  const setAccent = useCallback(async (id: string, accent: Accent) => {
    setNodes((p) => p.map((n) => (n.id === id ? { ...n, accent } : n)));
    try {
      await updateNode(id, { accent });
    } catch { /* ignore */ }
  }, []);

  const setPosition = useCallback(async (id: string, x: number, y: number) => {
    const snappedX = snapToGrid(x);
    const snappedY = snapToGrid(y);
    setNodes((p) => p.map((n) => (n.id === id ? { ...n, x: snappedX, y: snappedY, isManuallyPositioned: true } : n)));
    try { await updateNode(id, { x: snappedX, y: snappedY }); } catch { /* ignore */ }
  }, []);

  // ─── Inline label editing handler (30% Manual Override) ──────────────────
  const setLabel = useCallback(async (id: string, label: string) => {
    setNodes((p) => p.map((n) => (n.id === id ? { ...n, label } : n)));
    try { await updateNode(id, { label }); } catch { /* ignore */ }
  }, []);

  // ── Canvas State Sync & Entity Cleanup ──────────────────────────────────
  // Deleting a node cascades: all edges referencing the deleted node's ID
  // are instantly purged from local state AND the database, preventing
  // layout rendering exceptions from orphaned edge endpoints.
  const handleDeleteNode = useCallback(async (id: string) => {
    // 1. Cascade-filter: remove all edges pointing to this node
    const orphanedEdges = edges.filter((e) => e.from === id || e.to === id);
    setEdges((prev) => prev.filter((e) => e.from !== id && e.to !== id));

    // 2. Remove the node itself
    setNodes((prev) => prev.filter((n) => n.id !== id));

    // 3. Clear selection if the deleted node was selected
    setSelected((prev) => (prev === id ? null : prev));

    // 4. Persist deletions to the database (fire-and-forget)
    try {
      await deleteNode(id);
      await Promise.all(orphanedEdges.map((e) => deleteEdge(e.id)));
    } catch { /* ignore — local state is already clean */ }
  }, [edges]);

  // Delete a single edge (used by the edge cleanup loop and manual deletion)
  const handleDeleteEdge = useCallback(async (id: string) => {
    setEdges((prev) => prev.filter((e) => e.id !== id));
    try { await deleteEdge(id); } catch { /* ignore */ }
  }, []);

  // ─── localStorage auto-save ───────────────────────────────────────────────
  useEffect(() => {
    if (isLoading) return;
    try {
      localStorage.setItem(CANVAS_STORAGE_KEY, JSON.stringify({ nodes, edges }));
    } catch { /* quota exceeded or private browsing */ }
  }, [nodes, edges, isLoading]);

  // ─── localStorage hydration on mount ──────────────────────────────────────
  // Restore manually-positioned node coordinates so a browser refresh doesn't
  // discard the user's custom layout. Runs once after the initial load settles.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    if (hydrated || isLoading || nodes.length === 0) return;
    try {
      const raw = localStorage.getItem(CANVAS_STORAGE_KEY);
      if (!raw) { setHydrated(true); return; }
      const saved = JSON.parse(raw) as { nodes?: NodeData[]; edges?: EdgeData[] };
      if (!saved.nodes) { setHydrated(true); return; }
      const posMap = new Map<string, { x: number; y: number }>();
      for (const sn of saved.nodes) {
        if (sn.id && typeof sn.x === "number" && typeof sn.y === "number") {
          posMap.set(sn.id, { x: sn.x, y: sn.y });
        }
      }
      setNodes((prev) => prev.map((n) => {
        const p = posMap.get(n.id);
        return p ? { ...n, x: p.x, y: p.y, isManuallyPositioned: true } : n;
      }));
    } catch { /* corrupt JSON — ignore and keep current layout */ }
    setHydrated(true);
  }, [hydrated, isLoading, nodes.length]);

  // ─── JSON export ──────────────────────────────────────────────────────────
  const handleExportJSON = useCallback(() => {
    const payload = JSON.stringify({ nodes, edges, projectName: project?.name ?? "repodre-canvas" }, null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${project?.name ?? "repodre-canvas"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [nodes, edges, project?.name]);

  // ─── JSON import ──────────────────────────────────────────────────────────
  const handleImportFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        if (Array.isArray(data.nodes)) setNodes(data.nodes);
        if (Array.isArray(data.edges)) setEdges(data.edges);
      } catch { /* invalid JSON */ }
    };
    reader.readAsText(file);
    // Reset input so same file can be re-imported
    e.target.value = "";
  }, []);

  // ─── Child node spawn ─────────────────────────────────────────────────────
  const handleSpawnChild = useCallback((parentId: string) => {
    const parent = nodes.find((n) => n.id === parentId);
    if (!parent) return;
    const childX = snapToGrid(parent.x + (parent.w ?? NODE_W) + 60);
    const childY = snapToGrid(parent.y);
    const newId = `node_${Date.now()}`;
    const newEdgeId = `edge_${Date.now() + 1}`;
    const newNode: NodeData = {
      id: newId,
      label: "New Node",
      sub: parent.sub,
      shape: parent.shape,
      accent: parent.accent,
      x: childX,
      y: childY,
      workspace,
      isManuallyPositioned: true,
    };
    const newEdge: EdgeData = {
      id: newEdgeId,
      from: parentId,
      to: newId,
      fromHandle: "e",
      toHandle: "w",
    };
    setNodes((prev) => [...prev, newNode]);
    setEdges((prev) => [...prev, newEdge]);
    setSelected(newId);
    setNodeIdCounter((c) => c + 1);
    createNode(project?.id ?? "demo", newNode).catch(() => {});
    createEdge(project?.id ?? "demo", newEdge).catch(() => {});
  }, [nodes, workspace, project?.id]);

  // ─── Apply layout directives ──────────────────────────────────────────────
  const handleApplyLayout = useCallback(() => {
    const { direction, gapX, gapY } = parseLayoutDirectives(layoutDirectives);
    const START_X = 80, START_Y = 80;
    const COLS = direction === "LR" ? 4 : 1;
    let idx = 0;
    setNodes((prev) =>
      prev.map((n) => {
        if (n.isManuallyPositioned) return n;
        const col = idx % COLS;
        const row = Math.floor(idx / COLS);
        idx++;
        const x = snapToGrid(direction === "LR" ? START_X + col * gapX : START_X + row * gapX);
        const y = snapToGrid(direction === "LR" ? START_Y + row * gapY : START_Y + col * gapY);
        return { ...n, x, y };
      })
    );
    setShowLayoutPopover(false);
  }, [layoutDirectives]);

  const setSub = useCallback(async (id: string, sub: string) => {
    setNodes((p) => p.map((n) => (n.id === id ? { ...n, sub } : n)));
  }, []);

  const reattach = useCallback((nodeId: string, handle: HandleSegment) => {
    setEdges((p) =>
      p.map((e) => {
        if (e.from === nodeId) return { ...e, fromHandle: handle };
        if (e.to === nodeId)   return { ...e, toHandle:   handle };
        return e;
      })
    );
  }, []);

  const handleZoomChange = useCallback(async (z: number) => {
    setZoom(z);
    if (project) {
      try { await updateProject(project.id, { zoom: z }); } catch { /* ignore */ }
    }
  }, [project]);

  const handleWorkspaceChange = useCallback(async (ws: Workspace) => {
    setWorkspace(ws);
  }, []);

  // Import a DDL schema into the ERD viewport: create a new ERD project,
  // persist table nodes + FK edges, and swap the active project.
  const handleSchemaImport = useCallback(
    async (tables: ParsedTable[], ddl: string) => {
      try {
        setIsLoading(true);
        const newProject = await createProject({
          name: "imported-schema.erd",
          description: `Database ERD imported from pasted DDL (${tables.length} tables)`,
          zoom: 100,
          autoLayout: true,
          smartRoute: true,
          workspace: "erd",
          schemaSource: ddl,
        });

        // Create table nodes
        const tableNodes = tables.map((t) => ({
          label: t.name,
          sub: "Table",
          shape: "cylinder" as Shape,
          accent: "blue" as Accent,
          x: 0,
          y: 0,
          workspace: "erd" as Workspace,
          columns: t.columns.map((c) => ({
            name: c.name,
            type: c.type,
            pk: c.pk,
            fk: c.fk,
            unique: c.unique,
            nullable: c.nullable,
          })),
          tableName: t.name,
        }));
        const savedNodes = await batchCreateNodes(newProject.id, tableNodes);

        // Map table name -> saved node id for FK edge creation
        const tableIdMap = new Map<string, string>();
        tables.forEach((t, i) => tableIdMap.set(t.name, savedNodes[i].id));

        // Build FK edges with cardinality
        const fkEdges: Omit<Edge, "id" | "projectId">[] = [];
        for (const t of tables) {
          for (const col of t.columns) {
            if (col.fk && col.referencesTable && tableIdMap.has(col.referencesTable)) {
              const fromId = tableIdMap.get(t.name)!;
              const toId = tableIdMap.get(col.referencesTable)!;
              const cardinality = detectCardinality(col);
              fkEdges.push({
                from: fromId,
                to: toId,
                cardinality,
                fromColumn: col.name,
                toColumn: col.referencesColumn ?? "id",
              });
            }
          }
        }
        await batchCreateEdges(newProject.id, fkEdges);

        // Switch to the ERD workspace and load the new project
        setWorkspace("erd");
        setProject(newProject);
        setNodes(
          savedNodes.map((n) => ({
            id: n.id,
            label: n.label,
            sub: n.sub,
            shape: n.shape as Shape,
            accent: n.accent as Accent,
            x: n.x,
            y: n.y,
            workspace: n.workspace,
            columns: n.columns,
            tableName: n.tableName,
          }))
        );
        setEdges(
          fkEdges.map((e, i) => ({
            id: `imp_e${i}`,
            from: e.from,
            to: e.to,
            cardinality: e.cardinality,
            fromColumn: e.fromColumn,
            toColumn: e.toColumn,
          }))
        );
        setSchemaSource(ddl);
      } catch (err) {
        console.error("Schema import failed:", err);
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  // Pre-compute routed paths (memoised)
  // ── Edge-Snapping Path Engine: dynamic port-based bezier recalculation ──
  // The useEdgeSnap hook resolves explicit left/right boundary ports for each
  // node and builds a smooth cubic-bezier path that snaps exactly to the port
  // coordinates. Paths recalculate on every render (including during drag),
  // so wires always track node positions without clipping into geometry.
  const snapResult = useEdgeSnap(
    nodes.map((n) => ({ ...n, w: n.w ?? NODE_W, h: n.h ?? NODE_H })),
    edges,
  );

  // Smart Links: classify edges by architectural layer (UI -> Controller -> DB)
  const smartLinksResult = useMemo(
    () =>
      useSmartLinks(
        nodes.map((n) => ({
          id: n.id,
          label: n.label,
          sub: n.sub,
          shape: n.shape,
          accent: n.accent,
          x: n.x,
          y: n.y,
          workspace: n.workspace,
        })),
        edges.map((e) => ({ id: e.id, from: e.from, to: e.to }))
      ),
    [nodes, edges]
  );

  // For edges without explicit handles, fall back to the collision-aware
  // routeEdge (which may detour around obstacles). Edges with handles use
  // the snapped port path from useEdgeSnap.
  const routed = useMemo(
    () =>
      edges.map((e) => {
        const a = nodes.find((n) => n.id === e.from);
        const b = nodes.find((n) => n.id === e.to);
        if (!a || !b) return { id: e.id, path: "", detoured: false };

        if (wireStyle === "straight") {
          return { id: e.id, path: straightEdgePath(a, b), detoured: false };
        }
        if (wireStyle === "orthogonal") {
          return { id: e.id, path: orthogonalEdgePath(a, b), detoured: false };
        }

        // Curvy (default): snap-based bezier with smart collision routing
        const snap = snapResult.edges.get(e.id);
        if (snap && snap.path) {
          return { id: e.id, path: snap.path, detoured: false };
        }
        const r = routeEdge(a, b, smartRoute ? nodes : [a, b]);
        return { id: e.id, path: r.path, detoured: r.detoured };
      }),
    [edges, nodes, smartRoute, snapResult, wireStyle],
  );

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-teal" />
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-background text-foreground">

      {/* ── Top ribbon ──────────────────────────────────────────────────── */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-surface px-4">
        <div className="flex items-center gap-3">
          <Link to="/" className="flex items-center gap-2.5 transition-opacity hover:opacity-80">
            <RepodreLogo className="h-8 w-8" />
            <span className="font-display text-sm font-semibold tracking-tight">Repodre</span>
          </Link>
          <span className="mx-1 h-5 w-px bg-border" />
          <WorkspaceSwitcher workspace={workspace} onChange={handleWorkspaceChange} />
          <span className="mx-1 h-5 w-px bg-border" />
          <span className="font-mono text-xs text-muted-foreground">
            {project?.name ?? (workspace === "app" ? "ecommerce-system" : "ecommerce-schema")}{" "}
            / <span className="text-foreground">{workspace === "app" ? "execution-flow.map" : "schema.erd"}</span>
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Schema import + export (ERD viewport only) */}
          {workspace === "erd" && (
            <>
              <SchemaInput
                value={schemaSource}
                onValueChange={setSchemaSource}
                onSubmit={handleSchemaImport}
                isLoading={isLoading}
              />
              <ExportSchemaButton nodes={nodes} edges={edges} />
            </>
          )}

          {/* Shape quick-picker — only 4 in ribbon; full set in node panel (App viewport only) */}
          {workspace === "app" && (
            <div className="flex items-center gap-0.5 rounded-lg border border-border bg-background p-1">
              {(["rectangle", "pill", "diamond", "cylinder"] as Shape[]).map((s) => (
                <button
                  key={s}
                  title={s.charAt(0).toUpperCase() + s.slice(1)}
                  disabled={!sel}
                  onClick={() => sel && setShape(sel.id, s)}
                  className={`flex h-8 w-9 items-center justify-center rounded-md transition-all duration-200 disabled:opacity-40 ${
                    sel?.shape === s
                      ? "bg-teal/20 text-teal shadow-[0_0_14px_-2px_var(--teal)]"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
                >
                  <ShapeIcon shape={s} />
                </button>
              ))}
            </div>
          )}

          {/* Smart-route toggle (App viewport only) */}
          {workspace === "app" && (
            <button
              onClick={() => {
                const next = !smartRoute;
                setSmartRoute(next);
                if (project) updateProject(project.id, { smartRoute: next }).catch(() => {});
              }}
              title="Collision-aware connector routing"
              className={`flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-medium transition-all ${
                smartRoute
                  ? "border-teal/50 bg-teal/10 text-teal"
                  : "border-border bg-background text-muted-foreground hover:text-foreground"
              }`}
            >
              <Spline className="h-3.5 w-3.5" />
              Smart Route
              <span className={`ml-1 h-1.5 w-1.5 rounded-full ${smartRoute ? "bg-teal" : "bg-muted-foreground/40"}`} />
            </button>
          )}

          {/* Auto-layout toggle (App viewport only) */}
          {workspace === "app" && (
            <button
              onClick={() => {
                const next = !autoLayout;
                setAutoLayout(next);
                if (project) updateProject(project.id, { autoLayout: next }).catch(() => {});
              }}
              className={`flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-medium transition-all ${
                autoLayout
                  ? "border-teal/50 bg-teal/10 text-teal"
                  : "border-border bg-background text-muted-foreground hover:text-foreground"
              }`}
            >
              <Magnet className="h-3.5 w-3.5" />
              Auto-Layout
              <span className={`ml-1 h-1.5 w-1.5 rounded-full ${autoLayout ? "bg-teal" : "bg-muted-foreground/40"}`} />
            </button>
          )}

          {/* Wire style selector (App viewport only) */}
          {workspace === "app" && (
            <div className="flex items-center gap-0.5 rounded-lg border border-border bg-background p-1" title="Connector wire style">
              {(["curvy", "straight", "orthogonal"] as WireStyle[]).map((style) => {
                const icons: Record<WireStyle, React.ReactNode> = {
                  curvy: <Spline className="h-3.5 w-3.5" />,
                  straight: <Minus className="h-3.5 w-3.5" />,
                  orthogonal: <CornerDownRight className="h-3.5 w-3.5" />,
                };
                const labels: Record<WireStyle, string> = { curvy: "Curvy", straight: "Straight", orthogonal: "Orthogonal" };
                return (
                  <button
                    key={style}
                    title={labels[style]}
                    onClick={() => setWireStyle(style)}
                    className={`flex h-7 w-8 items-center justify-center rounded-md transition-all duration-200 ${
                      wireStyle === style
                        ? "bg-teal/20 text-teal"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    }`}
                  >
                    {icons[style]}
                  </button>
                );
              })}
            </div>
          )}

          {/* Environment Toggle (App viewport only) */}
          {workspace === "app" && (
            <EnvironmentToggle
              value={environment}
              onChange={setEnvironment}
            />
          )}

          {/* Layout Directives (App viewport only) */}
          {workspace === "app" && (
            <div className="relative">
              <button
                onClick={() => setShowLayoutPopover((v) => !v)}
                title="Layout directives"
                className={`flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-medium transition-all ${
                  showLayoutPopover
                    ? "border-teal/50 bg-teal/10 text-teal"
                    : "border-border bg-background text-muted-foreground hover:text-foreground"
                }`}
              >
                <Layout className="h-3.5 w-3.5" />
                Layout
              </button>
              {showLayoutPopover && (
                <div className="absolute right-0 top-11 z-50 w-72 rounded-xl border border-border bg-popover p-4 shadow-2xl">
                  <p className="mb-2 text-xs font-semibold text-foreground">Layout Directives</p>
                  <p className="mb-3 text-[11px] text-muted-foreground">
                    e.g. <code className="rounded bg-surface px-1">direction: LR, gap-x: 280, gap-y: 160</code>
                  </p>
                  <input
                    type="text"
                    value={layoutDirectives}
                    onChange={(e) => setLayoutDirectives(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleApplyLayout()}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs text-foreground placeholder:text-muted-foreground focus:border-teal focus:outline-none"
                    placeholder="direction: LR, gap-x: 280, gap-y: 160"
                  />
                  <p className="mt-2 text-[10px] text-muted-foreground">
                    Manually-positioned nodes are excluded. Press Enter or click Apply.
                  </p>
                  <button
                    onClick={handleApplyLayout}
                    className="mt-3 w-full rounded-lg bg-teal px-3 py-2 text-xs font-semibold text-white hover:bg-teal/90 transition-colors"
                  >
                    Apply Custom Layout
                  </button>
                </div>
              )}
            </div>
          )}

          {/* JSON Export / Import (App viewport only) */}
          {workspace === "app" && (
            <>
              <button
                onClick={handleExportJSON}
                title="Export project as JSON"
                className="flex h-9 items-center gap-2 rounded-lg border border-border bg-background px-3 text-xs font-medium text-muted-foreground transition-all hover:border-teal hover:text-teal"
              >
                <Download className="h-3.5 w-3.5" />
                Export
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                title="Import project from JSON"
                className="flex h-9 items-center gap-2 rounded-lg border border-border bg-background px-3 text-xs font-medium text-muted-foreground transition-all hover:border-teal hover:text-teal"
              >
                <Upload className="h-3.5 w-3.5" />
                Import
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleImportFile}
                className="hidden"
              />
            </>
          )}

          {/* Zoom controls */}
          <div className="flex items-center gap-1 rounded-lg border border-border bg-background px-1.5 py-1">
            <button
              onClick={() => handleZoomChange(Math.max(25, zoom - 10))}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <span className="w-11 text-center font-mono text-xs tabular-nums">{zoom}%</span>
            <button
              onClick={() => handleZoomChange(Math.min(200, zoom + 10))}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>

          <RecenterButton onClick={canvasPan.resetPan} />

          {/* API Test Export (App viewport only) */}
          {workspace === "app" && (
            <ApiTestExportButton
              controllers={mockControllers}
              modules={mockModules}
              projectName={project?.name || "ecommerce-system"}
            />
          )}

          {/* Code Preview Toggle (App viewport only) */}
          {workspace === "app" && (
            <CodePreviewToggle
              onClick={() => setCodePreviewOpen(!codePreviewOpen)}
              isOpen={codePreviewOpen}
              hasSelection={!!sel}
            />
          )}

          {/* Bottleneck Summary (App viewport only) */}
          {workspace === "app" && bottleneckWarnings.length > 0 && (
            <BottleneckBadge warnings={bottleneckWarnings} />
          )}

          {/* Simulation Mode Toggle (App viewport only) */}
          {workspace === "app" && (
            <SimulationModeToggle
              isActive={simulationOpen}
              onClick={() => setSimulationOpen(!simulationOpen)}
            />
          )}

          {/* System Insights Toggle (App viewport only) */}
          {workspace === "app" && (
            <SystemInsightsToggle
              isOpen={insightsOpen}
              onClick={() => setInsightsOpen(!insightsOpen)}
              warningCount={nodes.filter((n) =>
                edges.every((e) => e.from !== n.id && e.to !== n.id)
              ).length}
            />
          )}

          {/* AST Stream View Toggle (App viewport only) */}
          {workspace === "app" && (
            <AstTokenizerToggle
              onClick={() => setAstInspectorOpen(!astInspectorOpen)}
              isActive={astInspectorOpen}
            />
          )}

          {/* Simulate Live Traffic Toggle (App viewport only) */}
          {workspace === "app" && (
            <button
              onClick={() => setLiveTrafficActive(!liveTrafficActive)}
              title="Simulate live traffic execution on SVG paths"
              className={`flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-medium transition-all ${
                liveTrafficActive
                  ? "border-teal/50 bg-teal/10 text-teal"
                  : "border-border bg-background text-muted-foreground hover:border-teal hover:text-teal"
              }`}
            >
              <Activity className="h-3.5 w-3.5" />
              Live Traffic
              <span className={`ml-1 h-1.5 w-1.5 rounded-full ${liveTrafficActive ? "bg-teal animate-pulse" : "bg-muted-foreground/40"}`} />
            </button>
          )}

          {/* Export Code Architecture Template (App viewport only) */}
          {workspace === "app" && (
            <button
              onClick={() => {
                const scaffold = generateScaffold(
                  project?.name || "repodre-architecture",
                  nodes.map((n) => ({
                    id: n.id,
                    label: n.label,
                    sub: n.sub,
                    shape: n.shape,
                    accent: n.accent,
                    workspace: n.workspace,
                    tableName: n.tableName,
                    columns: n.columns,
                  })),
                  edges.map((e) => ({
                    id: e.id,
                    from: e.from,
                    to: e.to,
                    cardinality: e.cardinality,
                    fromColumn: e.fromColumn,
                    toColumn: e.toColumn,
                  })),
                );
                downloadScaffold(scaffold);
              }}
              title="Export code architecture template as scaffold"
              className="flex h-9 items-center gap-2 rounded-lg border border-border bg-background px-3 text-xs font-medium text-muted-foreground transition-all hover:border-teal hover:text-teal"
            >
              <FileCode2 className="h-3.5 w-3.5" />
              Export Scaffold
            </button>
          )}

          {/* Webhook Sync Toggle (App viewport only) */}
          {workspace === "app" && (
            <WebhookSyncToggle
              isActive={webhookSyncOpen}
              onClick={() => setWebhookSyncOpen(!webhookSyncOpen)}
              isConnected={webhookSync.isConnected}
              hasPendingSync={!!lastWebhookEvent}
            />
          )}

          {/* Multiplayer Presence Toggle (App viewport only) */}
          {workspace === "app" && (
            <MultiplayerToggle
              isActive={multiplayerOpen}
              onClick={() => setMultiplayerOpen(!multiplayerOpen)}
              collaboratorCount={presenceState.collaborators.length}
              isConnected={presenceState.isConnected}
            />
          )}

          {/* Git PR Diff Toggle (App viewport only) */}
          {workspace === "app" && (
            <GitDiffToggle
              isActive={gitDiffOpen}
              onClick={() => {
                if (!gitDiffOpen) {
                  generateDiff();
                }
                setGitDiffOpen(!gitDiffOpen);
              }}
              diffCount={diffResult ? diffResult.addedCount + diffResult.deletedCount + diffResult.modifiedCount + diffResult.conflictCount : 0}
            />
          )}

          {/* Recenter workspace button */}
          <RecenterButton onClick={canvasPan.resetPan} />

          <ThemeToggle />
          <AuthButton />
        </div>
      </header>

      {/* Privacy Shield banner */}
      <PrivacyShield />

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      <div className="relative flex min-h-0 flex-1">
        {workspace === "app" && <FileTree nodes={nodes} edgeCount={edges.length} />}

        <main className="relative min-w-0 flex-1">
          {workspace === "app" ? (
            <>
              {/* App Journey Canvas */}
              <div
                ref={canvasRef}
                className="grid-canvas absolute inset-0 overflow-hidden"
                onClick={() => { setSelected(null); setShowLayoutPopover(false); }}
                onMouseDown={canvasPan.handleMouseDown}
                style={{ cursor: canvasPan.cursor }}
              >
                <div
                  className="relative h-full w-full origin-top-left"
                  style={{ transform: `${canvasPan.transform} scale(${zoom / 100})` }}
                >
                  {/* Edge SVG layer */}
                  <svg
                    data-testid="edge-layer"
                    className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
                  >
                    <defs>
                      {/* HIGH-CONTRAST: Solid dark arrow marker */}
                      <marker
                        id="arrow"
                        viewBox="0 0 10 10"
                        refX="9"
                        refY="5"
                        markerWidth="6"
                        markerHeight="6"
                        orient="auto-start-reverse"
                      >
                        <path d="M0 1 L9 5 L0 9 L2.5 5 Z" fill="var(--wire-primary)" />
                      </marker>
                      {/* Cross-reference link arrow marker (teal, low-opacity) */}
                      <marker
                        id="arrow-xref"
                        viewBox="0 0 10 10"
                        refX="9"
                        refY="5"
                        markerWidth="5"
                        markerHeight="5"
                        orient="auto-start-reverse"
                      >
                        <path d="M0 1 L9 5 L0 9 L2.5 5 Z" fill="var(--teal)" fillOpacity="0.5" />
                      </marker>
                      {/* Database flow arrow marker (blue) */}
                      <marker
                        id="arrow-db"
                        viewBox="0 0 10 10"
                        refX="9"
                        refY="5"
                        markerWidth="5"
                        markerHeight="5"
                        orient="auto-start-reverse"
                      >
                        <path d="M0 1 L9 5 L0 9 L2.5 5 Z" fill="var(--node-database-stroke)" />
                      </marker>
                    </defs>

                    {routed.map((r) => {
                      // Get smart link classification for this edge
                      const smartLink = smartLinksResult.smartLinks.find(sl => sl.id === r.id);
                      const linkType = smartLink?.linkType || "direct";

                      // Smart link styling based on architectural layer
                      const smartStrokeColor = highlightedEdgeIds.includes(r.id)
                        ? "var(--teal)"
                        : linkType === "ui-to-controller"
                          ? "var(--node-controller-stroke)"
                          : linkType === "controller-to-db"
                            ? "var(--node-database-stroke)"
                            : "var(--wire-primary)";

                      const smartDashArray = liveTrafficActive
                        ? "8 4"
                        : linkType === "controller-to-db"
                          ? "6 3"
                          : r.detoured
                            ? "5 3"
                            : undefined;

                      return r.path ? (
                        <path
                          key={r.id}
                          data-testid={`edge-${r.id}`}
                          data-detoured={r.detoured}
                          data-link-type={linkType}
                          d={r.path}
                          fill="none"
                          stroke={smartStrokeColor}
                          strokeWidth={highlightedEdgeIds.includes(r.id) ? 3 : r.detoured ? 1.5 : 2}
                          strokeOpacity={highlightedEdgeIds.includes(r.id) ? 1 : 1}
                          strokeDasharray={smartDashArray}
                          markerEnd={linkType === "controller-to-db" ? "url(#arrow-db)" : "url(#arrow)"}
                          className={
                            highlightedEdgeIds.includes(r.id)
                              ? "animate-pulse-glow"
                              : linkType === "ui-to-controller"
                                ? "repodre-controller-flow"
                                : linkType === "controller-to-db"
                                  ? "repodre-db-flow"
                                  : liveTrafficActive
                                    ? "repodre-traffic-flow"
                                    : ""
                          }
                        />
                      ) : null;
                    })}

                    {/* Cross-reference links (low-opacity relation wires) */}
                    {crossRefLinks.map((xref) => {
                      const fromNode = nodes.find((n) => n.id === xref.fromNodeId);
                      const toNode = nodes.find((n) => n.id === xref.toNodeId);
                      if (!fromNode || !toNode) return null;
                      const path = straightEdgePath(fromNode, toNode);
                      return (
                        <path
                          key={xref.id}
                          data-testid={`xref-${xref.id}`}
                          data-xref-table={xref.tableName}
                          d={path}
                          fill="none"
                          stroke="var(--teal)"
                          strokeWidth={1.5}
                          strokeOpacity={0.35}
                          strokeDasharray="4 6"
                          markerEnd="url(#arrow-xref)"
                          className="repodre-xref-link"
                        >
                          <title>{`Cross-reference: ${xref.tableName} (${xref.matchType}, confidence: ${Math.round(xref.confidence * 100)}%)`}</title>
                        </path>
                      );
                    })}
                  </svg>

                  {/* Node layer */}
                  {nodes.map((n) => (
                    <CanvasNode
                      key={n.id}
                      node={n}
                      zoom={zoom / 100}
                      selected={selected === n.id}
                      highlighted={highlightedNodeId === n.id}
                      showHandles={selected === n.id}
                      hoverHandle={hoverHandle}
                      onHoverHandle={setHoverHandle}
                      onReattach={(seg) => reattach(n.id, seg)}
                      onSelect={(e) => { e.stopPropagation(); setSelected(n.id); }}
                      onCycleShape={() => {
                        const idx = ALL_SHAPES.indexOf(n.shape);
                        setShape(n.id, ALL_SHAPES[(idx + 1) % ALL_SHAPES.length]);
                      }}
                      onDragEnd={(x, y) => setPosition(n.id, x, y)}
                      onStartDragConnect={(handleId, startPos) => dragToConnect.startDrag(n.id, handleId, startPos)}
                      onSetLabel={(label) => setLabel(n.id, label)}
                      onSpawnChild={() => handleSpawnChild(n.id)}
                      complexity={calculateComplexityForNode(n.label, n.sub, undefined)}
                      antiPatternWarnings={getWarningsForNode(n.id, antiPatternWarnings)}
                      envVars={getEnvVarsForNode(n.label, new Map([[mockModules[0]?.path?.split('/').pop()?.replace(/\.(ts|tsx)$/, '') || 'route', scanForEnvVariables(mockModules[0]?.source || '')]]))}
                      diffStatus={gitDiffOpen ? getNodeDiffStatus(n.id, diffResult) : undefined}
                    />
                  ))}

                  {/* Production overlay nodes (read replicas, firewall gates) */}
                  {productionOverlayNodes.map((n) => (
                    <div
                      key={n.id}
                      className="absolute opacity-70"
                      style={{
                        left: n.x,
                        top: n.y,
                        width: NODE_W,
                        height: NODE_H,
                        zIndex: 0,
                      }}
                    >
                      <NodeShapeSVG
                        shape={n.shape}
                        width={NODE_W}
                        height={NODE_H}
                        color={n.accent === "blue" ? "var(--node-database-stroke)" : "var(--node-gateway-stroke)"}
                        glow="transparent"
                        selected={false}
                        nodeType={n.accent === "blue" ? "database" : "gateway"}
                      />
                      <div style={textLayoutFor(n.shape)}>
                        <span className="mb-0.5 block truncate text-[10px] font-semibold uppercase tracking-wider" style={{ color: n.accent === "blue" ? "var(--node-database-stroke)" : "var(--orange)" }}>
                          {n.sub}
                        </span>
                        <div className="flex items-center gap-1">
                          {n.shape === "hexagon" && <Shield className="h-2.5 w-2.5 text-orange" />}
                          {n.shape === "cylinder" && <Server className="h-2.5 w-2.5" style={{ color: "var(--node-database-stroke)" }} />}
                          <span className="font-mono text-sm font-medium text-slate-700 dark:text-slate-300">{n.label}</span>
                        </div>
                      </div>
                      <div className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-orange/20 text-[8px] text-orange">
                        <Cloud className="h-2.5 w-2.5" />
                      </div>
                    </div>
                  ))}

                  {/* ── 30% Manual Override: Live edge drawing ── */}
                  <LiveEdgeDrawing
                    isActive={dragToConnect.isDragging}
                    startNode={dragToConnect.fromNodeId ? nodes.find((n) => n.id === dragToConnect.fromNodeId) ?? null : null}
                    startHandle={dragToConnect.fromHandle}
                    currentMousePos={dragToConnect.mousePos}
                    zoom={zoom / 100}
                    accentColor="var(--teal)"
                  />
                </div>
              </div>

              {/* Legend */}
              <div className="pointer-events-none absolute bottom-4 left-4 flex items-center gap-4 rounded-lg border border-border bg-surface/80 px-3 py-2 text-[11px] text-muted-foreground backdrop-blur">
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{background:"var(--neon-green)"}} />View</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rotate-45 inline-block" style={{background:"var(--neon-purple)"}} />Validation</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{background:"var(--teal)"}} />Controller</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{background:"var(--neon-blue)"}} />Database</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2" style={{background:"var(--orange)"}} />I/O</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2" style={{background:"var(--red)", clipPath:"polygon(50% 0, 100% 100%, 0 100%)"}} />Error</span>
              </div>

              {/* Node settings panel */}
              {sel && (
                <NodeOptions
                  node={sel}
                  onShape={(s) => setShape(sel.id, s)}
                  onAccent={(a) => setAccent(sel.id, a)}
                  onReattach={(seg) => reattach(sel.id, seg)}
                  onClose={() => setSelected(null)}
                  onDelete={() => handleDeleteNode(sel.id)}
                  envVars={getEnvVarsForNode(sel.label, new Map([[mockModules[0]?.path?.split('/').pop()?.replace(/\.(ts|tsx)$/, '') || 'route', scanForEnvVariables(mockModules[0]?.source || '')]]))}
                  antiPatternWarnings={getWarningsForNode(sel.id, antiPatternWarnings)}
                />
              )}

              {/* AST Tokenizer Inspector (App viewport only) */}
              {workspace === "app" && astInspectorOpen && sel && (
                <div className="absolute bottom-4 right-4 z-30 w-96">
                  <AstTokenizerInspector
                    source={mockModules[0]?.source || `// ${sel.label}\nconst ${sel.label.replace(/[^a-zA-Z0-9]/g, "")} = () => {\n  // Node: ${sel.sub}\n  return ${sel.label};\n};`}
                    nodeLabel={sel.label}
                  />
                </div>
              )}

              {/* Time-Travel Tracer (App viewport only) */}
              {workspace === "app" && (
                <TimeTravelTracer
                  nodes={nodes.map((n) => ({
                    id: n.id,
                    label: n.label,
                    type: n.shape === "pill" ? "view" : n.shape === "diamond" ? "validation" : n.shape === "rectangle" ? "controller" : n.shape === "cylinder" ? "database" : "error",
                  }))}
                  edges={edges.map((e) => ({ id: e.id, from: e.from, to: e.to }))}
                  onHighlightNode={setHighlightedNodeId}
                  onHighlightEdges={setHighlightedEdgeIds}
                />
              )}
            </>
          ) : (
            /* Database ERD Canvas */
            <ErdCanvas
              nodes={nodes}
              edges={edges}
              selected={selected}
              onSelect={setSelected}
              onDragEnd={setPosition}
              onDeleteNode={handleDeleteNode}
              zoom={zoom}
              panX={canvasPan.panX}
              panY={canvasPan.panY}
              onCanvasMouseDown={canvasPan.handleMouseDown}
              cursor={canvasPan.cursor}
            />
          )}
        </main>
      </div>

      {/* Code Preview Panel (slide-out drawer) */}
      <CodePreviewPanel
        isOpen={codePreviewOpen}
        onClose={() => setCodePreviewOpen(false)}
        selectedNode={sel ? {
          id: sel.id,
          type: sel.shape === "pill" ? "view" : sel.shape === "diamond" ? "validation" : sel.shape === "rectangle" ? "controller" : sel.shape === "cylinder" ? "database" : "view",
          label: sel.label,
          sub: sel.sub,
          shape: sel.shape,
          accent: sel.accent,
          key: sel.id,
        } : null}
        modules={mockModules}
      />

      {/* Simulation Mode Panel (App viewport only) */}
      {workspace === "app" && simulationOpen && (
        <SimulationMode
          isOpen={simulationOpen}
          onClose={() => setSimulationOpen(false)}
          nodes={nodes.map((n) => ({
            id: n.id,
            type: n.shape === "pill" ? "view" : n.shape === "diamond" ? "validation" : n.shape === "rectangle" ? "controller" : n.shape === "cylinder" ? "database" : "error",
            label: n.label,
          }))}
          edges={edges.map((e) => ({ id: e.id, from: e.from, to: e.to }))}
          onHighlightNode={setHighlightedNodeId}
          onHighlightEdges={setHighlightedEdgeIds}
        />
      )}

      {/* System Insights Dashboard (App viewport only) */}
      {workspace === "app" && insightsOpen && (
        <SystemInsightsDashboard
          isOpen={insightsOpen}
          onClose={() => setInsightsOpen(false)}
          nodes={nodes.map((n) => ({
            id: n.id,
            type: n.shape === "pill" ? "view" : n.shape === "diamond" ? "validation" : n.shape === "rectangle" ? "controller" : n.shape === "cylinder" ? "database" : "error",
            label: n.label,
          }))}
          edges={edges.map((e) => ({ id: e.id, from: e.from, to: e.to }))}
        />
      )}

      {/* Webhook Sync Panel (App viewport only) */}
      {workspace === "app" && webhookSyncOpen && (
        <WebhookSyncPanel
          isOpen={webhookSyncOpen}
          onClose={() => setWebhookSyncOpen(false)}
          isConnected={webhookSync.isConnected}
          lastEvent={lastWebhookEvent}
          onWebhookEvent={(event, mutations) => {
            setLastWebhookEvent(event);
            handleWebhookMutations(mutations);
          }}
        />
      )}

      {/* Multiplayer Presence Panel (App viewport only) */}
      {workspace === "app" && multiplayerOpen && (
        <MultiplayerPresence
          isOpen={multiplayerOpen}
          onClose={() => setMultiplayerOpen(false)}
          canvasRef={canvasRef}
          zoom={zoom}
          nodes={nodes}
        />
      )}

      {/* Ghost Cursors Overlay (App viewport only) */}
      {workspace === "app" && multiplayerOpen && presenceState.isConnected && (
        <GhostCursors collaborators={presenceState.collaborators} />
      )}

      {/* Git PR Diff Overlay (App viewport only) */}
      {workspace === "app" && gitDiffOpen && (
        <GitDiffOverlay
          isOpen={gitDiffOpen}
          onClose={() => setGitDiffOpen(false)}
          diffResult={diffResult}
          onApplyDiff={() => {
            clearDiff();
            setGitDiffOpen(false);
          }}
          onRevertDiff={() => {
            clearDiff();
          }}
        />
      )}

      {/* ── 30% Manual Override: Node Spawner Popover ── */}
      <NodeSpawnerPopover
        isOpen={nodeSpawner.isOpen}
        position={nodeSpawner.position}
        onSelect={nodeSpawner.handleSelect}
        onClose={nodeSpawner.closeSpawner}
      />
    </div>
  );
}

// ─── File tree ───────────────────────────────────────────────────────────────

interface TreeNode {
  name: string;
  icon?: typeof FileIcon;
  children?: TreeNode[];
}

/** Derives a Next.js-style file tree from canvas nodes using their route labels. */
function buildTreeFromNodes(nodes: NodeData[]): TreeNode[] {
  // Only route-shaped labels (starting with "/") generate file entries
  const appChildren: TreeNode[] = [];

  for (const node of nodes) {
    // Strip parenthetical hints: "/ (Landing)" → "/"
    const label = node.label.replace(/\s*\([^)]*\)/, "").trim();
    if (!label.startsWith("/")) continue;

    // Infer filename from node type
    const isApi = label.startsWith("/api/");
    const isController = node.shape === "rectangle";
    const filename = isApi || isController ? "route.ts" : "page.tsx";

    if (label === "/") {
      if (!appChildren.find((c) => c.name === "page.tsx")) {
        appChildren.push({ name: "page.tsx", icon: FileCode2 });
      }
      continue;
    }

    // Walk path segments and build nested folders
    const segments = label.slice(1).split("/").filter(Boolean);
    let currentChildren = appChildren;

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const isLast = i === segments.length - 1;

      if (isLast) {
        let folder = currentChildren.find((c) => c.name === seg && c.children);
        if (!folder) {
          folder = { name: seg, children: [] };
          currentChildren.push(folder);
        }
        if (!folder.children!.find((c) => c.name === filename)) {
          folder.children!.push({ name: filename, icon: FileCode2 });
        }
      } else {
        let folder = currentChildren.find((c) => c.name === seg && c.children);
        if (!folder) {
          folder = { name: seg, children: [] };
          currentChildren.push(folder);
        }
        currentChildren = folder.children!;
      }
    }
  }

  // Add layout.tsx at app root when multiple views exist
  if (nodes.filter((n) => n.shape === "pill").length > 1) {
    if (!appChildren.find((c) => c.name === "layout.tsx")) {
      appChildren.push({ name: "layout.tsx", icon: FileCode2 });
    }
  }

  // Sort: folders first, then files, both alphabetically
  const sort = (items: TreeNode[]): TreeNode[] =>
    [...items]
      .sort((a, b) => {
        if (a.children && !b.children) return -1;
        if (!a.children && b.children) return 1;
        return a.name.localeCompare(b.name);
      })
      .map((item) => ({
        ...item,
        children: item.children ? sort(item.children) : undefined,
      }));

  const sorted = sort(appChildren);

  if (sorted.length === 0) {
    return [{ name: "package.json", icon: FileIcon }];
  }

  return [
    { name: "app", children: sorted },
    { name: "package.json", icon: FileIcon },
  ];
}

function FileTree({ nodes, edgeCount }: { nodes: NodeData[]; edgeCount: number }) {
  const tree = useMemo(() => buildTreeFromNodes(nodes), [nodes]);

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Project Tree</span>
        <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <div className="flex-1 overflow-auto p-2 font-mono text-[13px]">
        {nodes.length === 0 ? (
          <p className="px-2 py-4 text-[11px] text-muted-foreground">No nodes loaded.</p>
        ) : (
          tree.map((n) => <TreeRow key={n.name} node={n} depth={0} defaultOpen />)
        )}
      </div>
      <div className="border-t border-border px-4 py-3 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full" style={{background:"var(--teal)"}} />
          {nodes.length} nodes · {edgeCount} edges
        </span>
      </div>
    </aside>
  );
}

function TreeRow({ node, depth, defaultOpen }: { node: TreeNode; depth: number; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(!!defaultOpen);
  const isFolder = !!node.children;
  const Icon = node.icon ?? FileIcon;
  return (
    <div>
      <button
        onClick={() => isFolder && setOpen((v) => !v)}
        className="group flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        style={{ paddingLeft: depth * 14 + 8 }}
      >
        {isFolder ? (
          <>
            {open ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
            {open
              ? <FolderOpen className="h-3.5 w-3.5 shrink-0 text-teal" />
              : <Folder className="h-3.5 w-3.5 shrink-0 text-teal" />}
          </>
        ) : (
          <>
            <span className="w-3.5" />
            <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </>
        )}
        <span className="truncate">{node.name}</span>
      </button>
      {isFolder && open && (
        <div>
          {node.children!.map((c) => (
            <TreeRow key={c.name} node={c} depth={depth + 1} defaultOpen={depth < 1} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Canvas Node ─────────────────────────────────────────────────────────────

function CanvasNode({
  node,
  zoom,
  selected,
  highlighted,
  showHandles,
  hoverHandle,
  onHoverHandle,
  onReattach,
  onSelect,
  onCycleShape,
  onDragEnd,
  onStartDragConnect,
  onSetLabel,
  onSpawnChild,
  complexity,
  antiPatternWarnings,
  envVars,
  diffStatus,
}: {
  node: NodeData;
  zoom: number;
  selected: boolean;
  highlighted?: boolean;
  showHandles: boolean;
  hoverHandle: string | null;
  onHoverHandle: (id: string | null) => void;
  onReattach: (seg: HandleSegment) => void;
  onSelect: (e: React.MouseEvent) => void;
  onCycleShape: () => void;
  onDragEnd: (x: number, y: number) => void;
  onStartDragConnect?: (handleId: HandleSegment, startPos: { x: number; y: number }) => void;
  onSetLabel?: (label: string) => void;
  onSpawnChild?: () => void;
  complexity?: ComplexityResult;
  antiPatternWarnings?: AntiPatternWarning[];
  envVars?: EnvScanResult | null;
  diffStatus?: DiffStatus;
}) {
  const a = ACCENT[node.accent];

  // Drag state
  const [isDragging, setIsDragging] = useState(false);
  const [tempPos, setTempPos] = useState({ x: node.x, y: node.y });

  // Sync external position changes
  useEffect(() => {
    if (!isDragging) setTempPos({ x: node.x, y: node.y });
  }, [node.x, node.y, isDragging]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    const startCX = e.clientX;
    const startCY = e.clientY;
    const originX = node.x;
    const originY = node.y;
    let latestPos = { x: originX, y: originY };

    setIsDragging(true);

    const onMove = (mv: MouseEvent) => {
      latestPos = {
        x: originX + (mv.clientX - startCX) / zoom,
        y: originY + (mv.clientY - startCY) / zoom,
      };
      setTempPos(latestPos);
    };

    const onUp = () => {
      setIsDragging(false);
      onDragEnd(latestPos.x, latestPos.y);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [node.x, node.y, zoom, onDragEnd]);

  const handles = anchorHandles({ shape: node.shape, x: 0, y: 0 });
  const cx = NODE_W / 2;
  const cy = NODE_H / 2;

  const contentStyle = textLayoutFor(node.shape);

  // Cylinder SVG is offset upward, so the outer div needs extra top padding
  const isCylinder = node.shape === "cylinder";

  // Compute diff styles
  const diffStyles = diffStatus ? getDiffNodeStyles(diffStatus) : {};

  // Determine diff class names
  const diffClassNames = diffStatus === "added" ? "animate-fade-in" :
    diffStatus === "deleted" ? "opacity-60" :
    diffStatus === "conflict" ? "animate-pulse" : "";

  return (
    <div
      className={`group absolute ${highlighted ? "animate-pulse-glow" : ""} ${diffClassNames}`}
      style={{
        left: isDragging ? tempPos.x : node.x,
        top:  isDragging ? tempPos.y : node.y,
        width: NODE_W,
        height: NODE_H,
        zIndex: isDragging ? 1000 : selected ? 10 : highlighted ? 5 : 1,
        cursor: isDragging ? "grabbing" : "grab",
        // Cylinder cap bleeds outside the bounding box — clip children but not SVG
        overflow: isCylinder ? "visible" : "visible",
        boxShadow: highlighted ? "0 0 20px 4px var(--teal)" : undefined,
        ...diffStyles,
      }}
      onClick={onSelect}
      onMouseDown={handleMouseDown}
    >
      {/* ── SVG shape background ── */}
      <NodeShapeSVG
        shape={node.shape}
        width={NODE_W}
        height={NODE_H}
        color={a.color}
        glow={a.glow}
        selected={selected}
        nodeType={a.nodeType}
      />

      {/* ── Text content box (inscribed safe zone) ── */}
      {node.parseError ? (
        <div style={contentStyle} className="flex flex-col items-center justify-center text-center">
          <AlertTriangle className="mb-1 h-4 w-4 text-red-500" />
          <span className="block text-[10px] font-bold uppercase tracking-wider text-red-500">
            Structure Parsing Blocked
          </span>
          <span className="mt-0.5 block text-[9px] text-muted-foreground">
            Syntax Mismatch
          </span>
        </div>
      ) : (
      <div style={contentStyle}>
        <span
          className="mb-0.5 block truncate text-[10px] font-semibold uppercase tracking-wider"
          style={{ color: a.color, maxWidth: "100%" }}
        >
          {node.sub}
        </span>
        {/* DYNAMIC CONTRAST: Semantic colors for dark/light legibility */}
        <EditableLabel
          value={node.label}
          onSave={(newLabel) => onSetLabel?.(newLabel)}
          className={`block break-words font-mono text-sm font-medium leading-tight ${
            node.accent === "green" ? "text-emerald-950 dark:text-emerald-50" :
            node.accent === "teal" ? "text-sky-950 dark:text-sky-50" :
            node.accent === "purple" ? "text-amber-950 dark:text-amber-50" :
            node.accent === "blue" ? "text-slate-900 dark:text-slate-100" :
            node.accent === "orange" ? "text-orange-950 dark:text-orange-50" :
            "text-red-950 dark:text-red-50"
          }`}
          maxWidth={textMaxWidth(node.shape)}
          editHint="Double-click to rename"
        />
      </div>
      )}

      {/* ── 30% Manual Override: Drag-to-connect handles (always visible on hover) ── */}
      <DragToConnectHandle
        nodeId={node.id}
        shape={node.shape}
        x={isDragging ? tempPos.x : node.x}
        y={isDragging ? tempPos.y : node.y}
        w={node.w ?? NODE_W}
        h={node.h ?? NODE_H}
        accentColor={a.color}
        accentGlow={a.glow}
        visible={true} // Always show on hover via CSS
        zoom={zoom}
        onStartDrag={(handleId, startPos) => onStartDragConnect?.(handleId, startPos)}
      />

      {/* ── Perimeter anchor handles (shown when selected) ── */}
      {showHandles &&
        handles.map((h) => {
          const key = `${node.id}:${h.id}`;
          const hot = hoverHandle === key;
          return (
            <button
              key={h.id}
              title={`Reattach · ${h.label}`}
              onMouseEnter={() => onHoverHandle(key)}
              onMouseLeave={() => onHoverHandle(null)}
              onClick={(e) => { e.stopPropagation(); onReattach(h.id); }}
              className="absolute z-20 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 transition-all duration-150"
              style={{
                left: cx + (h.x - cx),
                top:  cy + (h.y - cy),
                width:  hot ? 16 : 10,
                height: hot ? 16 : 10,
                background: hot ? a.color : "var(--surface)",
                borderColor: a.color,
                boxShadow: hot ? `0 0 10px 2px ${a.glow}` : "none",
              }}
            >
              <span className="sr-only">{h.label}</span>
            </button>
          );
        })}

      {/* ── Cycle-shape button ── */}
      <button
        onClick={(e) => { e.stopPropagation(); onCycleShape(); }}
        title="Cycle shape"
        className={`absolute -right-2 -top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-surface text-muted-foreground opacity-0 transition-all duration-200 hover:text-teal group-hover:opacity-100 ${
          selected ? "opacity-100" : ""
        }`}
      >
        <Sparkles className="h-3 w-3" />
      </button>

      {/* ── Controller Badge (for logic layer nodes) ── */}
      {isControllerNode(node) && (
        <ControllerBadge className="absolute -left-1 -top-2 z-20" />
      )}

      {/* ── Anti-Pattern Warning Banner (View-to-DB Bypass) ── */}
      {antiPatternWarnings && antiPatternWarnings.length > 0 && (
        <div className="absolute -top-8 left-0 right-0 z-30">
          <div className="flex items-center gap-1.5 rounded-md bg-red-500/90 px-2 py-1 text-[9px] font-medium text-white shadow-md">
            <AlertTriangle className="h-3 w-3 shrink-0" />
            <span className="truncate">
              Anti-Pattern: View-to-DB Bypass Detected
            </span>
          </div>
        </div>
      )}

      {/* ── Git Diff Status Badge ── */}
      {diffStatus && diffStatus !== "unchanged" && (
        <div className="absolute -top-6 left-1/2 -translate-x-1/2 z-30">
          <div
            className={`flex items-center gap-1 rounded-md px-2 py-0.5 text-[9px] font-medium text-white shadow-md ${
              diffStatus === "added" ? "bg-green-500" :
              diffStatus === "deleted" ? "bg-red-500" :
              diffStatus === "modified" ? "bg-blue-500" :
              "bg-orange-500"
            }`}
          >
            {diffStatus === "added" && <Plus className="h-2.5 w-2.5" />}
            {diffStatus === "deleted" && <Minus className="h-2.5 w-2.5" />}
            {diffStatus === "conflict" && <AlertTriangle className="h-2.5 w-2.5" />}
            <span className="capitalize">{diffStatus}</span>
          </div>
        </div>
      )}

      {/* ── Strikethrough for deleted nodes ── */}
      {diffStatus === "deleted" && (
        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
          <div className="h-0.5 w-full bg-red-500 rotate-[-8deg]" />
        </div>
      )}

      {/* ── Cyclomatic Complexity Badge (top-right corner) ── */}
      {complexity && (
        <div
          className={`absolute -top-2.5 right-1 z-10 flex items-center rounded-full border px-1.5 py-0.5 text-[8px] font-bold leading-none ${getComplexityBg(complexity.level)} ${getComplexityColor(complexity.level)}`}
          title={`${complexity.label} — ${complexity.description}`}
        >
          M={complexity.complexity}
        </div>
      )}

      {/* ── Spawn child node button (right-center edge) ── */}
      {onSpawnChild && (
        <button
          onClick={(e) => { e.stopPropagation(); onSpawnChild(); }}
          title="Add child node"
          className="absolute -right-4 top-1/2 z-20 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border-2 border-teal bg-background text-teal opacity-0 shadow-md transition-all duration-200 hover:bg-teal hover:text-white group-hover:opacity-100"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

// ─── Node options panel ───────────────────────────────────────────────────────

const SEGMENTS: { id: HandleSegment; label: string }[] = [
  { id: "n", label: "Top" },
  { id: "e", label: "Right" },
  { id: "s", label: "Bottom" },
  { id: "w", label: "Left" },
];

function NodeOptions({
  node,
  onShape,
  onAccent,
  onReattach,
  onClose,
  onDelete,
  envVars,
  antiPatternWarnings,
}: {
  node: NodeData;
  onShape: (s: Shape) => void;
  onAccent: (a: Accent) => void;
  onReattach: (seg: HandleSegment) => void;
  onClose: () => void;
  onDelete: () => void;
  envVars?: EnvScanResult | null;
  antiPatternWarnings?: AntiPatternWarning[];
}) {
  const a = ACCENT[node.accent];

  return (
    <div className="animate-slide-up absolute right-4 top-4 w-72 rounded-xl border border-border bg-popover/95 p-4 shadow-2xl backdrop-blur">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Node Settings</p>
          <p className="mt-0.5 max-w-[200px] truncate font-mono text-xs text-foreground">{node.label}</p>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onDelete}
            title="Delete node (cascades edges)"
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-500"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onClose}
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Shape dictionary — all 7 shapes */}
      <p className="mb-2 text-[11px] font-medium text-muted-foreground">Geometric shape</p>
      <div className="mb-5 grid grid-cols-4 gap-1.5">
        {ALL_SHAPES.map((s) => {
          const active = node.shape === s;
          return (
            <button
              key={s}
              onClick={() => onShape(s)}
              title={s.charAt(0).toUpperCase() + s.slice(1)}
              className={`flex h-11 flex-col items-center justify-center gap-1 rounded-lg border transition-all duration-200 ${
                active
                  ? "border-teal bg-teal/10 text-teal shadow-[0_0_14px_-4px_var(--teal)]"
                  : "border-border bg-background text-muted-foreground hover:text-foreground"
              }`}
            >
              <ShapeIcon shape={s} />
              <span className="text-[9px] capitalize leading-none">{s}</span>
            </button>
          );
        })}
      </div>

      {/* Connector anchor quick-set */}
      <p className="mb-2 text-[11px] font-medium text-muted-foreground">Connector anchor</p>
      <div className="mb-5 grid grid-cols-4 gap-1.5">
        {SEGMENTS.map((seg) => (
          <button
            key={seg.id}
            onClick={() => onReattach(seg.id)}
            className="flex h-9 items-center justify-center rounded-lg border border-border bg-background text-[11px] font-medium text-muted-foreground transition-all duration-200 hover:border-teal/60 hover:text-teal"
          >
            {seg.label}
          </button>
        ))}
      </div>

      {/* Accent color */}
      <p className="mb-2 text-[11px] font-medium text-muted-foreground">Accent</p>
      <div className="mb-5 flex flex-wrap gap-2">
        {(Object.keys(ACCENT) as Accent[]).map((key) => {
          const active = node.accent === key;
          return (
            <button
              key={key}
              onClick={() => onAccent(key)}
              title={ACCENT[key].label}
              className={`h-7 w-7 rounded-full border-2 transition-all duration-200 ${
                active ? "scale-110 border-foreground" : "border-transparent opacity-70 hover:opacity-100"
              }`}
              style={{ background: ACCENT[key].color }}
            />
          );
        })}
      </div>

      {/* Required Context Keys — Environment Variables */}
      {envVars && envVars.variables.length > 0 && (
        <div className="mb-4">
          <p className="mb-2 text-[11px] font-medium text-muted-foreground">Required Context Keys</p>
          <div className="space-y-1.5">
            {envVars.requiredVars.length > 0 && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-2">
                <p className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-red-500">Required</p>
                <div className="space-y-1">
                  {envVars.requiredVars.map((v) => (
                    <div key={v} className="flex items-center gap-1.5">
                      <Key className="h-3 w-3 text-red-500" />
                      <code className="font-mono text-[10px] text-foreground">{v}</code>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {envVars.optionalVars.length > 0 && (
              <div className="rounded-lg border border-teal/30 bg-teal/5 p-2">
                <p className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-teal">Optional (has default)</p>
                <div className="space-y-1">
                  {envVars.optionalVars.map((v) => (
                    <div key={v} className="flex items-center gap-1.5">
                      <Key className="h-3 w-3 text-teal" />
                      <code className="font-mono text-[10px] text-foreground">{v}</code>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <p className="text-[9px] text-muted-foreground">
              Detected in source — bind these keys in your deployment environment.
            </p>
          </div>
        </div>
      )}

      {/* Anti-Pattern Warnings Section */}
      {antiPatternWarnings && antiPatternWarnings.length > 0 && (
        <div className="mb-4">
          <p className="mb-2 text-[11px] font-medium text-red-500">Architectural Warnings</p>
          <div className="space-y-2">
            {antiPatternWarnings.map((warning) => (
              <div
                key={warning.id}
                className="rounded-lg border border-red-500/30 bg-red-500/5 p-2.5"
              >
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground">{warning.description}</p>
                    <p className="mt-1 text-[10px] text-muted-foreground">{warning.recommendation}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Live shape preview */}
      <div className="mt-4 flex items-center justify-center rounded-lg bg-background/60 p-3">
        <div
          style={{
            width: 140,
            height: 56,
            position: "relative",
          }}
        >
          <NodeShapeSVG
            shape={node.shape}
            width={140}
            height={56}
            color={a.color}
            glow={a.glow}
            selected={false}
          />
          <div style={textLayoutFor(node.shape, 140, 56)}>
            <span className="block font-mono text-[9px] text-muted-foreground">{node.sub}</span>
            <span className="block truncate font-mono text-[10px] text-foreground">{node.label}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
