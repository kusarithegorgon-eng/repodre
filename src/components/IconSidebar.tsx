import { useState, useCallback } from "react";
import {
  Download, Upload, Activity, Play, GitBranch, RefreshCw,
  Plus, Minus, Settings2, Spline, Magnet, CornerDownRight, Users,
  Eye, Zap, Database, BookOpen, Workflow,
  Link2, Camera, Clock, FileText, AlertTriangle,
} from "lucide-react";

interface TooltipProps { content: string; children: React.ReactNode; }
function Tooltip({ content, children }: TooltipProps) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      {children}
      {show && (
        <div className="pointer-events-none absolute left-full ml-3 top-1/2 -translate-y-1/2 z-[200] whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium shadow-lg border"
          style={{ background: "var(--popover)", color: "var(--popover-foreground)", borderColor: "var(--border)", animation: "fadeIn 150ms ease" }}>
          {content}
          <span className="absolute right-full top-1/2 -translate-y-1/2 border-y-4 border-y-transparent border-r-4"
            style={{ borderRightColor: "var(--popover)" }} />
        </div>
      )}
    </div>
  );
}

interface BtnProps {
  icon: React.ReactNode; tooltip: string; onClick?: () => void;
  disabled?: boolean; active?: boolean; badge?: boolean; spinning?: boolean;
}
function SidebarButton({ icon, tooltip, onClick, disabled, active, badge, spinning }: BtnProps) {
  return (
    <Tooltip content={tooltip}>
      <button onClick={onClick} disabled={disabled}
        className={`flex h-10 w-10 items-center justify-center rounded-lg border transition-all duration-200 relative
          ${active ? "border-teal/50 bg-teal/10 text-teal" : "bg-background text-muted-foreground hover:border-teal/60 hover:text-foreground hover:shadow-sm hover:-translate-y-px"}
          ${disabled ? "cursor-not-allowed opacity-40" : ""}`}
        style={active ? { borderColor: "var(--teal)", background: "color-mix(in srgb, var(--teal) 10%, transparent)", color: "var(--teal)" } : { borderColor: "var(--border)", background: "var(--background)" }}>
        <span className={spinning ? "animate-spin" : ""}>{icon}</span>
        {badge && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full" style={{ background: "var(--teal)", boxShadow: "0 0 0 1px var(--surface)" }} />}
      </button>
    </Tooltip>
  );
}

function IconDivider() {
  return <div className="my-1 h-px w-8 shrink-0 self-center" style={{ background: "color-mix(in srgb, var(--border) 60%, transparent)" }} />;
}

export interface IconSidebarProps {
  workspace: "app" | "erd";
  zoom: number;
  isLoading: boolean;
  isResettingLayout: boolean;
  nodes: { id: string }[];
  autoLayout: boolean;
  smartRoute: boolean;
  wireStyle: "curvy" | "straight" | "orthogonal";
  simulationOpen: boolean;
  insightsOpen: boolean;
  astInspectorOpen: boolean;
  liveTrafficActive: boolean;
  multiplayerOpen: boolean;
  gitDiffOpen: boolean;
  gitDiffCount: number;
  codePreviewOpen: boolean;
  erdGuideOpen: boolean;
  membersOpen: boolean;
  shareOpen: boolean;
  snapshotOpen: boolean;
  readmeOpen: boolean;
  orphanCount: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onRecenter: () => void;
  onRefresh: () => void;
  onResetLayout: () => void;
  onExportJSON: () => void;
  onImportJSON: () => void;
  onChangeWorkspace: (ws: "app" | "erd") => void;
  onToggleAutoLayout: () => void;
  onToggleSmartRoute: () => void;
  onSetWireStyle: (s: "curvy" | "straight" | "orthogonal") => void;
  onToggleSimulation: () => void;
  onToggleInsights: () => void;
  onToggleAstInspector: () => void;
  onToggleLiveTraffic: () => void;
  onToggleMultiplayer: () => void;
  onToggleGitDiff: () => void;
  onToggleCodePreview: () => void;
  onImportSchema: () => void;
  onExportSchema: () => void;
  onToggleErdGuide: () => void;
  onToggleMembers: () => void;
  onToggleShare: () => void;
  onToggleSnapshot: () => void;
  onToggleReadme: () => void;
  onExportImage: () => void;
  isExportingImage: boolean;
  onToggleOrphanCheck: () => void;
  orphanCheckOpen: boolean;
}

export function IconSidebar(p: IconSidebarProps) {
  const cycleWire = useCallback(() => {
    const styles = ["curvy", "straight", "orthogonal"] as const;
    const next = (styles.indexOf(p.wireStyle) + 1) % 3;
    p.onSetWireStyle(styles[next]);
  }, [p.wireStyle, p.onSetWireStyle]);

  const wireIcon = { curvy: <Spline className="h-4 w-4" />, straight: <Minus className="h-4 w-4" />, orthogonal: <CornerDownRight className="h-4 w-4" /> };
  const wireTip = { curvy: "Wire: Curvy", straight: "Wire: Straight", orthogonal: "Wire: Orthogonal" };

  return (
    <aside className="fixed left-0 top-0 z-50 flex h-full w-14 flex-col items-center border-r" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
      <div className="flex shrink-0 flex-col items-center gap-2 border-b pt-3 pb-2 w-full" style={{ borderColor: "var(--border)" }}>
        <Tooltip content="Home"><a href="/" className="flex h-10 w-10 items-center justify-center rounded-lg transition-all hover:shadow-sm" style={{ color: "var(--foreground)" }}><Zap className="h-5 w-5" /></a></Tooltip>
        <div className="flex flex-col items-center gap-1 rounded-lg border p-1 w-10" style={{ borderColor: "var(--border)", background: "var(--background)" }}>
          <Tooltip content="App Journey"><button onClick={() => p.onChangeWorkspace("app")} className="flex h-8 w-8 items-center justify-center rounded-md transition-all"
            style={p.workspace === "app" ? { background: "color-mix(in srgb, var(--teal) 15%, transparent)", color: "var(--teal)" } : { color: "var(--muted-foreground)" }}><Workflow className="h-3.5 w-3.5" /></button></Tooltip>
          <Tooltip content="Database ERD"><button onClick={() => p.onChangeWorkspace("erd")} className="flex h-8 w-8 items-center justify-center rounded-md transition-all"
            style={p.workspace === "erd" ? { background: "color-mix(in srgb, var(--teal) 15%, transparent)", color: "var(--teal)" } : { color: "var(--muted-foreground)" }}><Database className="h-3.5 w-3.5" /></button></Tooltip>
        </div>
      </div>

      <div className="flex flex-1 flex-col items-center gap-1 overflow-y-auto overflow-x-hidden py-2 w-full scrollbar-thin">
        <div className="flex flex-col items-center gap-0.5 rounded-lg border p-1 w-10" style={{ borderColor: "var(--border)", background: "var(--background)" }}>
          <SidebarButton icon={<Plus className="h-4 w-4" />} tooltip="Zoom In" onClick={p.onZoomIn} disabled={p.zoom >= 200} />
          <span className="text-[9px] font-mono tabular-nums py-0.5" style={{ color: "var(--muted-foreground)" }}>{p.zoom}%</span>
          <SidebarButton icon={<Minus className="h-4 w-4" />} tooltip="Zoom Out" onClick={p.onZoomOut} disabled={p.zoom <= 25} />
        </div>

        <SidebarButton icon={<Eye className="h-4 w-4" />} tooltip="Recenter" onClick={p.onRecenter} />
        <SidebarButton icon={<RefreshCw className="h-4 w-4" />} tooltip="Refresh DB" onClick={p.onRefresh} disabled={p.isLoading} spinning={p.isLoading} />
        <IconDivider />

        {p.workspace === "app" && (
          <>
            <SidebarButton icon={<GitBranch className="h-4 w-4" />} tooltip="Reset Auto-Layout" onClick={p.onResetLayout} disabled={p.isResettingLayout || p.nodes.length === 0} spinning={p.isResettingLayout} />
            <SidebarButton icon={<Magnet className="h-4 w-4" />} tooltip={`Auto-Layout: ${p.autoLayout ? "ON" : "OFF"}`} onClick={p.onToggleAutoLayout} active={p.autoLayout} />
            <SidebarButton icon={<Spline className="h-4 w-4" />} tooltip={`Smart Route: ${p.smartRoute ? "ON" : "OFF"}`} onClick={p.onToggleSmartRoute} active={p.smartRoute} />
            <SidebarButton icon={wireIcon[p.wireStyle]} tooltip={wireTip[p.wireStyle]} onClick={cycleWire} />
            <IconDivider />
          </>
        )}

        {p.workspace === "erd" && (
          <>
            <SidebarButton icon={<Database className="h-4 w-4" />} tooltip="Import DDL Schema" onClick={p.onImportSchema} />
            <SidebarButton icon={<Download className="h-4 w-4" />} tooltip="Export Schema as SQL" onClick={p.onExportSchema} disabled={p.nodes.length === 0} />
            <SidebarButton icon={<BookOpen className="h-4 w-4" />} tooltip="Cardinality Guide" onClick={p.onToggleErdGuide} active={p.erdGuideOpen} />
            <IconDivider />
          </>
        )}

        <SidebarButton icon={<Download className="h-4 w-4" />} tooltip="Export JSON" onClick={p.onExportJSON} />
        <SidebarButton icon={<Upload className="h-4 w-4" />} tooltip="Import JSON" onClick={p.onImportJSON} />
        <SidebarButton icon={<Camera className="h-4 w-4" />} tooltip="Export as PNG" onClick={p.onExportImage} spinning={p.isExportingImage} />
        <SidebarButton icon={<FileText className="h-4 w-4" />} tooltip="Generate README" onClick={p.onToggleReadme} active={p.readmeOpen} />
        <IconDivider />

        {p.workspace === "app" && (
          <>
            <SidebarButton icon={<Play className="h-4 w-4" />} tooltip="Simulation" onClick={p.onToggleSimulation} active={p.simulationOpen} />
            <SidebarButton icon={<Eye className="h-4 w-4" />} tooltip="Insights" onClick={p.onToggleInsights} active={p.insightsOpen} />
            <SidebarButton icon={<Settings2 className="h-4 w-4" />} tooltip="AST Inspector" onClick={p.onToggleAstInspector} active={p.astInspectorOpen} />
            <SidebarButton icon={<Activity className="h-4 w-4" />} tooltip="Live Traffic" onClick={p.onToggleLiveTraffic} active={p.liveTrafficActive} badge={p.liveTrafficActive} />
            <IconDivider />
          </>
        )}

        <SidebarButton icon={<AlertTriangle className="h-4 w-4" />} tooltip={`Orphan Check${p.orphanCount > 0 ? ` (${p.orphanCount})` : ""}`} onClick={p.onToggleOrphanCheck} active={p.orphanCheckOpen} badge={p.orphanCount > 0} />
        <SidebarButton icon={<Clock className="h-4 w-4" />} tooltip="Snapshots & Time Travel" onClick={p.onToggleSnapshot} active={p.snapshotOpen} />
        <SidebarButton icon={<Users className="h-4 w-4" />} tooltip="Team Members" onClick={p.onToggleMembers} active={p.membersOpen} />
        <SidebarButton icon={<Link2 className="h-4 w-4" />} tooltip="Public Share Link" onClick={p.onToggleShare} active={p.shareOpen} />
      </div>
    </aside>
  );
}
