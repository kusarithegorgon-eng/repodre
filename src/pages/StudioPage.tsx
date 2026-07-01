import { Link } from "@tanstack/react-router";
import { useMemo, useState, useEffect, useCallback, type CSSProperties } from "react";
import {
  ChevronDown,
  ChevronRight,
  File as FileIcon,
  FileCode2,
  Folder,
  FolderOpen,
  Magnet,
  Minus,
  Plus,
  Settings2,
  Sparkles,
  Spline,
  X,
  Loader as Loader2,
} from "lucide-react";
import { RepodreLogo } from "@/components/RepodreLogo";
import { AuthButton } from "@/components/AuthButton";
import { NodeShapeSVG, ShapeIcon } from "@/components/NodeShapeSVG";
import { WorkspaceSwitcher } from "@/components/WorkspaceSwitcher";
import { ErdCanvas } from "@/components/ErdCanvas";
import { SchemaInput } from "@/components/SchemaInput";
import { ExportSchemaButton } from "@/components/ExportSchemaButton";
import {
  NODE_W,
  NODE_H,
  CYLINDER_CAP,
  type Shape,
  type HandleSegment,
  type PositionedNode,
  anchorHandles,
  centerOf,
  paddingFor,
  perimeterPoint,
  routeEdge,
  textMaxWidth,
} from "@/lib/canvas-geometry";
import {
  loadFullProject,
  updateNode,
  updateProject,
  createProject,
  batchCreateNodes,
  batchCreateEdges,
  type Project,
  type Workspace,
  type Node as DbNode,
  type Edge as DbEdge,
} from "@/lib/db-client";
import { detectCardinality, type ParsedTable } from "@/lib/sql-tokenizer";

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

// ─── Design tokens ─────────────────────────────────────────────────────────

const ACCENT: Record<Accent, { color: string; glow: string; label: string }> = {
  green:  { color: "var(--neon-green)",  glow: "color-mix(in oklab, var(--neon-green)  40%, transparent)", label: "Endpoint Green" },
  purple: { color: "var(--neon-purple)", glow: "color-mix(in oklab, var(--neon-purple) 40%, transparent)", label: "Guard Purple" },
  teal:   { color: "var(--teal)",        glow: "color-mix(in oklab, var(--teal)        40%, transparent)", label: "Controller Teal" },
  blue:   { color: "var(--neon-blue)",   glow: "color-mix(in oklab, var(--neon-blue)   40%, transparent)", label: "Database Blue" },
  orange: { color: "#f97316",            glow: "color-mix(in oklab, #f97316            40%, transparent)", label: "Process Orange" },
  red:    { color: "#ef4444",            glow: "color-mix(in oklab, #ef4444            40%, transparent)", label: "Alert Red" },
};

const ALL_SHAPES: Shape[] = [
  "rectangle",
  "pill",
  "diamond",
  "cylinder",
  "triangle",
  "parallelogram",
  "document",
];

// ─── Demo seed data ────────────────────────────────────────────────────────

const INITIAL_NODES: NodeData[] = [
  { id: "n1", label: "/api/webhook/stripe", sub: "API Endpoint",    shape: "pill",         accent: "green",  x: 90,  y: 80,  workspace: "app" },
  { id: "n2", label: "verifySignature()",  sub: "Middleware Guard", shape: "diamond",      accent: "purple", x: 470, y: 90,  workspace: "app" },
  { id: "n3", label: "processPayment()",  sub: "Route Controller", shape: "rectangle",    accent: "teal",   x: 470, y: 360, workspace: "app" },
  { id: "n4", label: "profiles_table",    sub: "Supabase Model",   shape: "cylinder",     accent: "blue",   x: 90,  y: 380, workspace: "app" },
  { id: "n5", label: "stripe.ts",         sub: "I/O Data Block",   shape: "parallelogram",accent: "orange", x: 280, y: 220, workspace: "app" },
  { id: "n6", label: "event.type",        sub: "Branch Decision",  shape: "triangle",     accent: "red",    x: 750, y: 220, workspace: "app" },
];

const INITIAL_EDGES: EdgeData[] = [
  { id: "e1", from: "n1", to: "n2" },
  { id: "e2", from: "n2", to: "n3" },
  { id: "e3", from: "n3", to: "n4" },
  { id: "e4", from: "n4", to: "n1" },
  { id: "e5", from: "n1", to: "n5" },
  { id: "e6", from: "n2", to: "n6" },
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
  const [isLoading, setIsLoading] = useState(true);
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

  // Project IDs for the two demo workspaces
  const APP_PROJECT_ID = "00000000-0000-0000-0000-000000000001";
  const ERD_PROJECT_ID = "00000000-0000-0000-0000-000000000002";

  // Load the project for the active workspace
  useEffect(() => {
    async function loadProject() {
      setIsLoading(true);
      setSelected(null);
      const projectId = workspace === "app" ? APP_PROJECT_ID : ERD_PROJECT_ID;
      try {
        const fullProject = await loadFullProject(projectId);
        if (fullProject) {
          setProject(fullProject.project);
          setNodes(
            fullProject.nodes.map((n) => ({
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
            fullProject.edges.map((e) => ({
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
          setZoom(fullProject.project.zoom);
          setAutoLayout(fullProject.project.autoLayout);
          setSmartRoute(fullProject.project.smartRoute);
          setSchemaSource(fullProject.project.schemaSource ?? "");
        }
      } catch (err) {
        console.error("DB load failed, using demo data:", err);
      } finally {
        setIsLoading(false);
      }
    }
    loadProject();
  }, [workspace, APP_PROJECT_ID, ERD_PROJECT_ID]);

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
    setNodes((p) => p.map((n) => (n.id === id ? { ...n, x, y } : n)));
    try { await updateNode(id, { x, y }); } catch { /* ignore */ }
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
        const fkEdges: Omit<DbEdge, "id" | "projectId">[] = [];
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
  const routed = useMemo(
    () =>
      edges.map((e) => {
        const a = nodes.find((n) => n.id === e.from);
        const b = nodes.find((n) => n.id === e.to);
        if (!a || !b) return { id: e.id, path: "", detoured: false };

        const start = endpointFor(a, b, e.fromHandle);
        const end   = endpointFor(b, a, e.toHandle);

        if (e.fromHandle || e.toHandle) {
          const mx = (start.x + end.x) / 2;
          return {
            id: e.id,
            path: `M ${start.x} ${start.y} C ${mx} ${start.y}, ${mx} ${end.y}, ${end.x} ${end.y}`,
            detoured: false,
          };
        }
        const r = routeEdge(a, b, smartRoute ? nodes : [a, b]);
        return { id: e.id, path: r.path, detoured: r.detoured };
      }),
    [edges, nodes, smartRoute]
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
            {project?.name ?? (workspace === "app" ? "nextjs-supabase" : "blog-schema")}{" "}
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

          <AuthButton />
        </div>
      </header>

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1">
        {workspace === "app" && <FileTree nodes={nodes} edgeCount={edges.length} />}

        <main className="relative min-w-0 flex-1">
          {workspace === "app" ? (
            <>
              {/* App Journey Canvas */}
              <div
                className="grid-canvas absolute inset-0 overflow-hidden"
                onClick={() => setSelected(null)}
              >
                <div
                  className="relative h-full w-full origin-top-left"
                  style={{ transform: `scale(${zoom / 100})` }}
                >
                  {/* Edge SVG layer */}
                  <svg
                    data-testid="edge-layer"
                    className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
                  >
                    <defs>
                      <marker
                        id="arrow"
                        viewBox="0 0 10 10"
                        refX="9"
                        refY="5"
                        markerWidth="6"
                        markerHeight="6"
                        orient="auto-start-reverse"
                      >
                        <path d="M0 1 L9 5 L0 9 L2.5 5 Z" fill="var(--teal)" />
                      </marker>
                      <filter id="edgeGlow">
                        <feGaussianBlur stdDeviation="1.5" result="blur" />
                        <feComposite in="SourceGraphic" in2="blur" operator="over" />
                      </filter>
                    </defs>

                    {routed.map((r) =>
                      r.path ? (
                        <path
                          key={r.id}
                          data-testid={`edge-${r.id}`}
                          data-detoured={r.detoured}
                          d={r.path}
                          fill="none"
                          stroke="var(--teal)"
                          strokeWidth={r.detoured ? 1.5 : 2}
                          strokeOpacity={r.detoured ? 0.65 : 0.55}
                          strokeDasharray={r.detoured ? "5 3" : undefined}
                          markerEnd="url(#arrow)"
                        />
                      ) : null
                    )}
                  </svg>

                  {/* Node layer */}
                  {nodes.map((n) => (
                    <CanvasNode
                      key={n.id}
                      node={n}
                      zoom={zoom / 100}
                      selected={selected === n.id}
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
                    />
                  ))}
                </div>
              </div>

              {/* Legend */}
              <div className="pointer-events-none absolute bottom-4 left-4 flex items-center gap-4 rounded-lg border border-border bg-surface/80 px-3 py-2 text-[11px] text-muted-foreground backdrop-blur">
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{background:"var(--neon-green)"}} />Endpoint</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rotate-45 inline-block" style={{background:"var(--neon-purple)"}} />Guard</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{background:"var(--teal)"}} />Controller</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{background:"var(--neon-blue)"}} />Model</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2" style={{background:"#f97316"}} />I/O</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2" style={{background:"#ef4444", clipPath:"polygon(50% 0, 100% 100%, 0 100%)"}} />Branch</span>
              </div>

              {/* Node settings panel */}
              {sel && (
                <NodeOptions
                  node={sel}
                  onShape={(s) => setShape(sel.id, s)}
                  onAccent={(a) => setAccent(sel.id, a)}
                  onReattach={(seg) => reattach(sel.id, seg)}
                  onClose={() => setSelected(null)}
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
              zoom={zoom}
            />
          )}
        </main>
      </div>
    </div>
  );
}

// ─── File tree ───────────────────────────────────────────────────────────────

interface TreeNode {
  name: string;
  icon?: typeof FileIcon;
  children?: TreeNode[];
}

const TREE: TreeNode[] = [
  {
    name: "app",
    children: [
      { name: "api", children: [{ name: "webhook", children: [{ name: "stripe", children: [{ name: "route.ts", icon: FileCode2 }] }] }] },
      { name: "layout.tsx", icon: FileCode2 },
      { name: "page.tsx", icon: FileCode2 },
    ],
  },
  {
    name: "lib",
    children: [
      { name: "stripe.ts", icon: FileCode2 },
      { name: "verifySignature.ts", icon: FileCode2 },
      { name: "payments.ts", icon: FileCode2 },
    ],
  },
  {
    name: "supabase",
    children: [
      { name: "client.ts", icon: FileCode2 },
      { name: "migrations", children: [{ name: "0001_profiles.sql", icon: FileIcon }] },
    ],
  },
  { name: "package.json", icon: FileIcon },
];

function FileTree({ nodes, edgeCount }: { nodes: NodeData[]; edgeCount: number }) {
  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Project Tree</span>
        <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <div className="flex-1 overflow-auto p-2 font-mono text-[13px]">
        {TREE.map((n) => <TreeRow key={n.name} node={n} depth={0} defaultOpen />)}
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
  showHandles,
  hoverHandle,
  onHoverHandle,
  onReattach,
  onSelect,
  onCycleShape,
  onDragEnd,
}: {
  node: NodeData;
  zoom: number;
  selected: boolean;
  showHandles: boolean;
  hoverHandle: string | null;
  onHoverHandle: (id: string | null) => void;
  onReattach: (seg: HandleSegment) => void;
  onSelect: (e: React.MouseEvent) => void;
  onCycleShape: () => void;
  onDragEnd: (x: number, y: number) => void;
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

  return (
    <div
      className="group absolute"
      style={{
        left: isDragging ? tempPos.x : node.x,
        top:  isDragging ? tempPos.y : node.y,
        width: NODE_W,
        height: NODE_H,
        zIndex: isDragging ? 1000 : selected ? 10 : 1,
        cursor: isDragging ? "grabbing" : "grab",
        // Cylinder cap bleeds outside the bounding box — clip children but not SVG
        overflow: isCylinder ? "visible" : "visible",
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
      />

      {/* ── Text content box (inscribed safe zone) ── */}
      <div style={contentStyle}>
        <span
          className="mb-0.5 block truncate text-[10px] font-semibold uppercase tracking-wider"
          style={{ color: a.color, maxWidth: "100%" }}
        >
          {node.sub}
        </span>
        <span
          className="block break-words font-mono text-sm font-medium leading-tight text-foreground"
          style={{ maxWidth: "100%", textAlign: "center" }}
        >
          {node.label}
        </span>
      </div>

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
}: {
  node: NodeData;
  onShape: (s: Shape) => void;
  onAccent: (a: Accent) => void;
  onReattach: (seg: HandleSegment) => void;
  onClose: () => void;
}) {
  const a = ACCENT[node.accent];

  return (
    <div className="animate-slide-up absolute right-4 top-4 w-72 rounded-xl border border-border bg-popover/95 p-4 shadow-2xl backdrop-blur">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Node Settings</p>
          <p className="mt-0.5 max-w-[200px] truncate font-mono text-xs text-foreground">{node.label}</p>
        </div>
        <button
          onClick={onClose}
          className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
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
      <div className="flex flex-wrap gap-2">
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
