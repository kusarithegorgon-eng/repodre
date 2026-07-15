import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { IconSidebar } from "@/components/IconSidebar";
import { SchemaInput } from "@/components/SchemaInput";
import { SnapshotPanel } from "@/components/SnapshotPanel";
import { ReadmePanel } from "@/components/ReadmePanel";
import { OrphanCheckPanel } from "@/components/OrphanCheckPanel";
import { MembersPanel } from "@/components/MembersPanel";
import { ShareLinkPanel } from "@/components/ShareLinkPanel";
import {
  listProjects as _listProjects, loadFullProject, createProject, updateProject,
  createNode, updateNode, deleteNode, createEdge, deleteEdge,
  batchCreateNodes, batchCreateEdges,
  type Project,
} from "@/lib/db-client";
import { runSmartLayout } from "@/lib/elk-layout";
import { generateDDL, parseSQL } from "@/lib/sql-parser";
import { exportCanvasAsImage } from "@/lib/export-utils";
import { useFocusMode } from "@/hooks/useFocusMode";
import { useEdgeSnap } from "@/hooks/useEdgeSnap";
import {
  type NodeData, type EdgeData, type Shape, type Accent, type Workspace,
  NODE_W, NODE_H,
} from "@/lib/canvas-geometry";

const APP_PROJECT_ID = "00000000-0000-0000-0000-000000000001";
const ERD_PROJECT_ID = "00000000-0000-0000-0000-000000000002";

const ACCENT_MAP: Record<string, Accent> = { green: "green", purple: "purple", teal: "teal", blue: "blue", orange: "orange", red: "red" };

export function StudioPage() {
  const [workspace, setWorkspace] = useState<Workspace>("app");
  const [project, setProject] = useState<Project | null>(null);
  const [nodes, setNodes] = useState<NodeData[]>([]);
  const [edges, setEdges] = useState<EdgeData[]>([]);
  const [loading, setLoading] = useState(true);
  const [zoom, setZoom] = useState(100);
  const [autoLayout, setAutoLayout] = useState(true);
  const [smartRoute, setSmartRoute] = useState(true);
  const [wireStyle, setWireStyle] = useState<"curvy" | "straight" | "orthogonal">("orthogonal");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [showSchemaInput, setShowSchemaInput] = useState(false);
  const [schemaSource, setSchemaSource] = useState("");
  const [isResettingLayout, setIsResettingLayout] = useState(false);
  const [isExportingImage, setIsExportingImage] = useState(false);

  // Panel toggles
  const [simulationOpen, setSimulationOpen] = useState(false);
  const [insightsOpen, setInsightsOpen] = useState(false);
  const [astInspectorOpen, setAstInspectorOpen] = useState(false);
  const [liveTrafficActive, setLiveTrafficActive] = useState(false);
  const [multiplayerOpen, setMultiplayerOpen] = useState(false);
  const [gitDiffOpen, setGitDiffOpen] = useState(false);
  const [gitDiffCount] = useState(0);
  const [codePreviewOpen, setCodePreviewOpen] = useState(false);
  const [erdGuideOpen, setErdGuideOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [snapshotOpen, setSnapshotOpen] = useState(false);
  const [readmeOpen, setReadmeOpen] = useState(false);
  const [orphanCheckOpen, setOrphanCheckOpen] = useState(false);

  const canvasRef = useRef<HTMLDivElement>(null);

  const activeProjectId = workspace === "app" ? APP_PROJECT_ID : ERD_PROJECT_ID;

  // ─── Data Loading ──────────────────────────────────────────────────────────
  const refreshCanvas = useCallback(async () => {
    setLoading(true);
    try {
      const full = await loadFullProject(activeProjectId);
      if (full) {
        setProject(full.project);
        setNodes(full.nodes);
        setEdges(full.edges);
        setZoom(full.project.zoom);
        setAutoLayout(full.project.autoLayout);
        setSmartRoute(full.project.smartRoute);
        setSchemaSource(full.project.schemaSource ?? "");
      } else {
        // Create default project if it doesn't exist
        const p = await createProject(workspace === "app" ? "App Journey" : "Database ERD", workspace);
        setProject(p);
        setNodes([]);
        setEdges([]);
      }
    } catch (err) {
      console.error("Failed to load project:", err);
    } finally {
      setLoading(false);
    }
  }, [activeProjectId, workspace]);

  useEffect(() => { refreshCanvas(); }, [refreshCanvas]);

  // ─── Focus Mode (Contextual Path Lighting) ──────────────────────────────────
  const focusMode = useFocusMode(selectedId, edges);

  // ─── Edge Routing ────────────────────────────────────────────────────────────
  const { list: routedEdges } = useEdgeSnap(nodes, edges, wireStyle);

  // ─── Orphan Detection ──────────────────────────────────────────────────────
  const orphanCount = useMemo(() => {
    const connected = new Set<string>();
    for (const e of edges) { connected.add(e.from); connected.add(e.to); }
    return nodes.filter((n) => !connected.has(n.id)).length;
  }, [nodes, edges]);

  // ─── Node Interaction ──────────────────────────────────────────────────────
  const handleNodeMouseDown = (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    setSelectedId(nodeId);
    const node = nodes.find((n) => n.id === nodeId);
    if (node) {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        const screenX = (node.x + pan.x) * (zoom / 100) + rect.width / 2;
        const screenY = (node.y + pan.y) * (zoom / 100) + rect.height / 2;
        setDragOffset({ x: e.clientX - rect.left - screenX, y: e.clientY - rect.top - screenY });
      }
      setDragging(nodeId);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (dragging) {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        const screenX = e.clientX - rect.left - dragOffset.x - rect.width / 2;
        const screenY = e.clientY - rect.top - dragOffset.y - rect.height / 2;
        const x = screenX / (zoom / 100) - pan.x;
        const y = screenY / (zoom / 100) - pan.y;
        setNodes((prev) => prev.map((n) => n.id === dragging ? { ...n, x, y } : n));
      }
    } else if (isPanning) {
      const dx = e.clientX - panStart.x;
      const dy = e.clientY - panStart.y;
      setPan((prev) => ({ x: prev.x + dx / (zoom / 100), y: prev.y + dy / (zoom / 100) }));
      setPanStart({ x: e.clientX, y: e.clientY });
    }
  };

  const handleMouseUp = () => {
    if (dragging) {
      const node = nodes.find((n) => n.id === dragging);
      if (node) updateNode(dragging, { x: node.x, y: node.y }).catch(console.error);
    }
    setDragging(null);
    setIsPanning(false);
  };

  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget || (e.target as HTMLElement).dataset.canvasBg === "true") {
      setSelectedId(null);
      setIsPanning(true);
      setPanStart({ x: e.clientX, y: e.clientY });
    }
  };

  // ─── CRUD ────────────────────────────────────────────────────────────────────
  const handleAddNode = async () => {
    try {
      const newNode = await createNode(activeProjectId, {
        label: "New Component", sub: "", shape: "rectangle", accent: "teal",
        x: -pan.x + 100, y: -pan.y + 100, workspace,
      });
      setNodes((prev) => [...prev, newNode]);
      setSelectedId(newNode.id);
    } catch (err) { console.error("Failed to add node:", err); }
  };

  const handleDeleteNode = async (id: string) => {
    try {
      await deleteNode(id);
      setNodes((prev) => prev.filter((n) => n.id !== id));
      setEdges((prev) => prev.filter((e) => e.from !== id && e.to !== id));
      if (selectedId === id) setSelectedId(null);
    } catch (err) { console.error("Failed to delete:", err); }
  };

  const handleSetShape = async (id: string, shape: Shape) => {
    setNodes((prev) => prev.map((n) => n.id === id ? { ...n, shape } : n));
    updateNode(id, { shape }).catch(console.error);
  };

  const handleSetAccent = async (id: string, accent: Accent) => {
    setNodes((prev) => prev.map((n) => n.id === id ? { ...n, accent } : n));
    updateNode(id, { accent }).catch(console.error);
  };

  const handleSetLabel = async (id: string, label: string) => {
    setNodes((prev) => prev.map((n) => n.id === id ? { ...n, label } : n));
    updateNode(id, { label }).catch(console.error);
  };

  // ─── ERD: Drag-to-Connect FK ────────────────────────────────────────────────
  const [connecting, setConnecting] = useState<{ fromId: string; fromPos: { x: number; y: number } } | null>(null);

  const handleStartConnect = (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;
    setConnecting({ fromId: nodeId, fromPos: { x: node.x + (node.w ?? NODE_W) / 2, y: node.y + (node.h ?? NODE_H) / 2 } });
  };

  const handleEndConnect = async (targetId: string) => {
    if (!connecting || connecting.fromId === targetId) { setConnecting(null); return; }
    try {
      const newEdge = await createEdge(activeProjectId, {
        from: connecting.fromId, to: targetId,
        cardinality: "1:N", fromColumn: "id", toColumn: "fk_id",
      });
      setEdges((prev) => [...prev, newEdge]);
    } catch (err) { console.error("Failed to create edge:", err); }
    setConnecting(null);
  };

  // ─── Schema Import ──────────────────────────────────────────────────────────
  const handleSchemaImport = async (tables: ReturnType<typeof parseSQL>, ddl: string) => {
    try {
      // Delete existing ERD nodes
      for (const n of nodes.filter((n) => n.workspace === "erd")) {
        await deleteNode(n.id);
      }
      // Create new nodes from parsed tables
      const newNodes = tables.map((t, i) => ({
        label: t.name, sub: `${t.columns.length} columns`, shape: "cylinder" as Shape,
        accent: "blue" as Accent, x: 100 + (i % 4) * 300, y: 100 + Math.floor(i / 4) * 250,
        workspace: "erd" as Workspace, tableName: t.name, columns: t.columns,
      }));
      const created = await batchCreateNodes(activeProjectId, newNodes);
      setNodes((prev) => [...prev.filter((n) => n.workspace !== "erd"), ...created]);

      // Auto-create FK edges from REFERENCES
      const fkEdges: Partial<EdgeData>[] = [];
      for (const table of tables) {
        const fromNode = created.find((n) => n.tableName === table.name);
        if (!fromNode) continue;
        for (const col of table.columns) {
          if (col.isFK && col.references) {
            const [refTable] = col.references.split(".");
            const toNode = created.find((n) => n.tableName === refTable);
            if (toNode) {
              fkEdges.push({ from: fromNode.id, to: toNode.id, cardinality: "1:N", fromColumn: col.name, toColumn: "id" });
            }
          }
        }
      }
      if (fkEdges.length > 0) {
        const createdEdges = await batchCreateEdges(activeProjectId, fkEdges);
        setEdges((prev) => [...prev, ...createdEdges]);
      }

      // Save DDL source
      await updateProject(activeProjectId, { schema_source: ddl });
      setSchemaSource(ddl);
      setShowSchemaInput(false);
    } catch (err) { console.error("Schema import failed:", err); }
  };

  // ─── DDL Export (Round-Trip) ──────────────────────────────────────────────────
  const handleExportSchema = () => {
    const tables = nodes.filter((n) => n.workspace === "erd" && n.tableName).map((n) => ({
      name: n.tableName!, columns: n.columns ?? [],
    }));
    const ddl = generateDDL(tables);
    const blob = new Blob([ddl], { type: "text/sql" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${project?.name ?? "schema"}.sql`;
    a.click();
  };

  // ─── Layout ──────────────────────────────────────────────────────────────────
  const handleResetLayout = async () => {
    setIsResettingLayout(true);
    try {
      const lockedIds = new Set(nodes.filter((n) => n.isLocked).map((n) => n.id));
      const { positions } = await runSmartLayout(nodes, edges, { lockedIds, direction: workspace === "app" ? "RIGHT" : "DOWN" });
      const updated = nodes.map((n) => {
        const pos = positions.get(n.id);
        return pos ? { ...n, x: pos.x, y: pos.y } : n;
      });
      setNodes(updated);
      // Persist positions
      for (const n of updated) {
        const pos = positions.get(n.id);
        if (pos) await updateNode(n.id, { x: pos.x, y: pos.y });
      }
    } catch (err) { console.error("Layout failed:", err); }
    finally { setIsResettingLayout(false); }
  };

  // ─── Export ──────────────────────────────────────────────────────────────────
  const handleExportJSON = () => {
    const data = { nodes, edges, project: { name: project?.name, workspace } };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${project?.name ?? "canvas"}.json`;
    a.click();
  };

  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        if (data.nodes) setNodes(data.nodes);
        if (data.edges) setEdges(data.edges);
      } catch (err) { console.error("Import failed:", err); }
    };
    reader.readAsText(file);
  };

  const handleExportImage = async () => {
    if (!canvasRef.current) return;
    try {
      await exportCanvasAsImage(canvasRef.current, project?.name ?? "architecture", setIsExportingImage);
    } catch (err) {
      console.error("Image export failed:", err);
      alert(err instanceof Error ? err.message : "Failed to export image");
    }
  };

  // ─── Snapshot Restore ────────────────────────────────────────────────────────
  const handleRestoreSnapshot = async (snapNodes: NodeData[], snapEdges: EdgeData[]) => {
    // Delete existing nodes and edges
    for (const n of nodes) await deleteNode(n.id);
    for (const e of edges) await deleteEdge(e.id);
    // Recreate from snapshot
    const createdNodes = await batchCreateNodes(activeProjectId, snapNodes);
    const idMap = new Map<string, string>();
    snapNodes.forEach((n, i) => idMap.set(n.id, createdNodes[i].id));
    const mappedEdges = snapEdges.map((e) => ({ ...e, from: idMap.get(e.from) ?? e.from, to: idMap.get(e.to) ?? e.to }));
    const createdEdges = await batchCreateEdges(activeProjectId, mappedEdges);
    setNodes(createdNodes);
    setEdges(createdEdges);
  };

  // ─── Workspace Switch ────────────────────────────────────────────────────────
  const handleWorkspaceChange = (ws: Workspace) => {
    setWorkspace(ws);
    setSelectedId(null);
  };

  // ─── Render ───────────────────────────────────────────────────────────────────
  void nodes.find((n) => n.id === selectedId);

  return (
    <div className="flex h-screen w-screen overflow-hidden" style={{ background: "var(--bg)" }}>
      <IconSidebar
        workspace={workspace}
        zoom={zoom}
        isLoading={loading}
        isResettingLayout={isResettingLayout}
        nodes={nodes}
        autoLayout={autoLayout}
        smartRoute={smartRoute}
        wireStyle={wireStyle}
        simulationOpen={simulationOpen}
        insightsOpen={insightsOpen}
        astInspectorOpen={astInspectorOpen}
        liveTrafficActive={liveTrafficActive}
        multiplayerOpen={multiplayerOpen}
        gitDiffOpen={gitDiffOpen}
        gitDiffCount={gitDiffCount}
        codePreviewOpen={codePreviewOpen}
        erdGuideOpen={erdGuideOpen}
        membersOpen={membersOpen}
        shareOpen={shareOpen}
        snapshotOpen={snapshotOpen}
        readmeOpen={readmeOpen}
        orphanCount={orphanCount}
        onZoomIn={() => setZoom((z) => Math.min(200, z + 25))}
        onZoomOut={() => setZoom((z) => Math.max(25, z - 25))}
        onRecenter={() => { setPan({ x: 0, y: 0 }); setZoom(100); }}
        onRefresh={refreshCanvas}
        onResetLayout={handleResetLayout}
        onExportJSON={handleExportJSON}
        onImportJSON={() => document.getElementById("json-import")?.click()}
        onChangeWorkspace={handleWorkspaceChange}
        onToggleAutoLayout={() => { setAutoLayout(!autoLayout); if (project) updateProject(project.id, { autoLayout: !autoLayout }).catch(() => {}); }}
        onToggleSmartRoute={() => { setSmartRoute(!smartRoute); if (project) updateProject(project.id, { smartRoute: !smartRoute }).catch(() => {}); }}
        onSetWireStyle={setWireStyle}
        onToggleSimulation={() => setSimulationOpen(!simulationOpen)}
        onToggleInsights={() => setInsightsOpen(!insightsOpen)}
        onToggleAstInspector={() => setAstInspectorOpen(!astInspectorOpen)}
        onToggleLiveTraffic={() => setLiveTrafficActive(!liveTrafficActive)}
        onToggleMultiplayer={() => setMultiplayerOpen(!multiplayerOpen)}
        onToggleGitDiff={() => setGitDiffOpen(!gitDiffOpen)}
        onToggleCodePreview={() => setCodePreviewOpen(!codePreviewOpen)}
        onImportSchema={() => setShowSchemaInput(true)}
        onExportSchema={handleExportSchema}
        onToggleErdGuide={() => setErdGuideOpen(!erdGuideOpen)}
        onToggleMembers={() => setMembersOpen(!membersOpen)}
        onToggleShare={() => setShareOpen(!shareOpen)}
        onToggleSnapshot={() => setSnapshotOpen(!snapshotOpen)}
        onToggleReadme={() => setReadmeOpen(!readmeOpen)}
        onExportImage={handleExportImage}
        isExportingImage={isExportingImage}
        onToggleOrphanCheck={() => setOrphanCheckOpen(!orphanCheckOpen)}
        orphanCheckOpen={orphanCheckOpen}
      />

      {/* Canvas Area */}
      <div className="relative flex-1 overflow-hidden" style={{ marginLeft: 56 }}>
        <div
          ref={canvasRef}
          className="absolute inset-0"
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          data-no-export="false"
        >
          {/* Background grid */}
          <div data-canvas-bg="true" className="absolute inset-0"
            style={{
              backgroundImage: `radial-gradient(circle, var(--border) 1px, transparent 1px)`,
              backgroundSize: `${20 * (zoom / 100)}px ${20 * (zoom / 100)}px`,
              backgroundPosition: `${pan.x * (zoom / 100)}px ${pan.y * (zoom / 100)}px`,
            }}
          />

          {/* SVG Edges Layer */}
          <svg className="absolute inset-0 pointer-events-none" style={{ width: "100%", height: "100%" }}>
            {routedEdges.map((r) => {
              const opacity = focusMode.getEdgeOpacity(r.id);
              return r.path && !r.orphaned ? (
                <g key={r.id} style={{ opacity, transition: "opacity 200ms ease" }}>
                  <path d={r.path} fill="none" stroke="var(--muted-foreground)" strokeWidth={2} strokeOpacity={0.5} />
                  {edges.find((e) => e.id === r.id)?.cardinality && (
                    <text x={(r.start.x + r.end.x) / 2} y={(r.start.y + r.end.y) / 2}
                      className="text-[10px]" fill="var(--muted-foreground)" textAnchor="middle">
                      {edges.find((e) => e.id === r.id)?.cardinality}
                    </text>
                  )}
                </g>
              ) : null;
            })}
            {/* Connecting line while dragging */}
            {connecting && (
              <line x1={connecting.fromPos.x} y1={connecting.fromPos.y}
                x2={(connecting.fromPos.x + 100)} y2={(connecting.fromPos.y + 100)}
                stroke="var(--teal)" strokeWidth={2} strokeDasharray="4 4" />
            )}
          </svg>

          {/* Nodes Layer */}
          {nodes.map((n) => {
            const opacity = focusMode.getNodeOpacity(n.id);
            const isSelected = n.id === selectedId;
            return (
              <div
                key={n.id}
                onMouseDown={(e) => handleNodeMouseDown(e, n.id)}
                onMouseUp={dragging === n.id ? handleMouseUp : undefined}
                className="absolute cursor-move select-none transition-opacity"
                style={{
                  left: n.x, top: n.y, width: n.w ?? NODE_W, height: n.h ?? NODE_H,
                  opacity, transition: "opacity 200ms ease",
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom / 100})`,
                  transformOrigin: "0 0",
                }}
              >
                <NodeCard node={n} isSelected={isSelected} workspace={workspace}
                  onSetShape={handleSetShape} onSetAccent={handleSetAccent}
                  onSetLabel={handleSetLabel} onDelete={handleDeleteNode}
                  onStartConnect={handleStartConnect} onEndConnect={handleEndConnect}
                />
              </div>
            );
          })}

          {/* Loading overlay */}
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center" style={{ background: "color-mix(in srgb, var(--bg) 80%, transparent)" }}>
              <div className="text-sm" style={{ color: "var(--muted-foreground)" }}>Loading...</div>
            </div>
          )}
        </div>

        {/* Floating Add Button */}
        <button onClick={handleAddNode}
          className="fixed bottom-4 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full text-white shadow-lg transition-all hover:scale-110"
          style={{ background: "var(--teal)" }}>
          <span className="text-2xl">+</span>
        </button>

        {/* Hidden file input for JSON import */}
        <input id="json-import" type="file" accept=".json" className="hidden" onChange={handleImportJSON} />
      </div>

      {/* Schema Input Modal */}
      {showSchemaInput && (
        <SchemaInput value={schemaSource} onValueChange={setSchemaSource} onSubmit={handleSchemaImport} onClose={() => setShowSchemaInput(false)} />
      )}

      {/* Panels */}
      <SnapshotPanel isOpen={snapshotOpen} onClose={() => setSnapshotOpen(false)} projectId={activeProjectId} nodes={nodes} edges={edges} onRestore={handleRestoreSnapshot} />
      <ReadmePanel isOpen={readmeOpen} onClose={() => setReadmeOpen(false)} nodes={nodes} edges={edges} projectName={project?.name ?? "Architecture"} workspace={workspace} />
      <OrphanCheckPanel isOpen={orphanCheckOpen} onClose={() => setOrphanCheckOpen(false)} nodes={nodes} edges={edges} onSelectNode={setSelectedId} />
      <MembersPanel isOpen={membersOpen} onClose={() => setMembersOpen(false)} projectId={activeProjectId} />
      <ShareLinkPanel isOpen={shareOpen} onClose={() => setShareOpen(false)} projectId={activeProjectId} />
    </div>
  );
}

// ─── Node Card Component ───────────────────────────────────────────────────────

interface NodeCardProps {
  node: NodeData;
  isSelected: boolean;
  workspace: Workspace;
  onSetShape: (id: string, s: Shape) => void;
  onSetAccent: (id: string, a: Accent) => void;
  onSetLabel: (id: string, l: string) => void;
  onDelete: (id: string) => void;
  onStartConnect: (e: React.MouseEvent, id: string) => void;
  onEndConnect: (id: string) => void;
}

function NodeCard({ node, isSelected, workspace, onSetShape, onSetAccent, onSetLabel, onDelete, onStartConnect, onEndConnect }: NodeCardProps) {
  const accentColor = `var(--${node.accent})`;
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(node.label);

  return (
    <div
      onMouseUp={() => onEndConnect(node.id)}
      className="flex flex-col rounded-lg border-2 shadow-lg transition-all"
      style={{
        borderColor: isSelected ? "var(--teal)" : accentColor,
        background: "var(--surface)",
        width: "100%", height: "100%",
        boxShadow: isSelected ? `0 0 0 2px var(--teal)` : "0 4px 12px rgba(0,0,0,0.15)",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: "var(--border)" }}>
        {editing ? (
          <input value={label} onChange={(e) => setLabel(e.target.value)} onBlur={() => { onSetLabel(node.id, label); setEditing(false); }} onKeyDown={(e) => { if (e.key === "Enter") { onSetLabel(node.id, label); setEditing(false); } }} className="flex-1 bg-transparent text-sm font-medium outline-none" style={{ color: "var(--foreground)" }} autoFocus />
        ) : (
          <span className="flex-1 truncate text-sm font-medium" style={{ color: "var(--foreground)" }} onDoubleClick={() => setEditing(true)}>{node.label}</span>
        )}
        {/* Drag-to-connect handle for ERD */}
        {workspace === "erd" && (
          <button onMouseDown={(e) => onStartConnect(e, node.id)} className="flex h-5 w-5 items-center justify-center rounded-full border-2 cursor-crosshair hover:scale-125 transition-transform" style={{ borderColor: accentColor, background: "var(--surface)" }} title="Drag to create FK relationship">
            <span className="text-[10px]" style={{ color: accentColor }}>+</span>
          </button>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 px-3 py-1.5 overflow-hidden">
        {node.sub && <p className="text-[10px] truncate" style={{ color: "var(--muted-foreground)" }}>{node.sub}</p>}
        {node.columns && node.columns.length > 0 && (
          <div className="mt-1 space-y-0.5">
            {node.columns.slice(0, 5).map((col, i) => (
              <div key={i} className="flex items-center justify-between text-[10px]">
                <span className="flex items-center gap-1" style={{ color: "var(--foreground)" }}>
                  {col.isPK && <span style={{ color: "var(--teal)" }}>PK</span>}
                  {col.isFK && <span style={{ color: "var(--blue)" }}>FK</span>}
                  {col.name}
                </span>
                <span className="font-mono" style={{ color: "var(--muted-foreground)" }}>{col.type}</span>
              </div>
            ))}
            {node.columns.length > 5 && <div className="text-[9px]" style={{ color: "var(--muted-foreground)" }}>+{node.columns.length - 5} more</div>}
          </div>
        )}
      </div>

      {/* Footer: shape/accent controls (selected only) */}
      {isSelected && (
        <div className="flex items-center gap-1 px-2 py-1.5 border-t" style={{ borderColor: "var(--border)" }}>
          <select value={node.shape} onChange={(e) => onSetShape(node.id, e.target.value as Shape)} className="rounded border px-1 py-0.5 text-[10px] outline-none" style={{ background: "var(--background)", borderColor: "var(--border)", color: "var(--foreground)" }}>
            {["rectangle", "pill", "diamond", "cylinder", "hexagon", "document"].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={node.accent} onChange={(e) => onSetAccent(node.id, e.target.value as Accent)} className="rounded border px-1 py-0.5 text-[10px] outline-none" style={{ background: "var(--background)", borderColor: "var(--border)", color: "var(--foreground)" }}>
            {Object.keys(ACCENT_MAP).map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <button onClick={() => onDelete(node.id)} className="ml-auto rounded px-2 py-0.5 text-[10px] transition-all hover:bg-red-500/10" style={{ color: "var(--red)" }}>Delete</button>
        </div>
      )}
    </div>
  );
}
