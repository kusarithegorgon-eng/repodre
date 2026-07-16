/**
 * IconSidebar — Fixed Vertical Toolbar
 *
 * Icon-only vertical sidebar with hover tooltips and full scrolling support.
 * Houses primary canvas controls for both App Journey and Database ERD workspaces.
 */

import { useState, useCallback } from "react";
import { Download, Upload, Activity, Play, FileCode2, GitBranch, RefreshCw, Plus, Minus, Settings2, Spline, Magnet, CornerDownRight, Cloud, Users, GitCompare, Eye, Zap, Inbox, Database, BookOpen, Workflow, Chrome as Home, ShieldCheck, MessageCircle } from "lucide-react";

// ─── Tooltip ────────────────────────────────────────────────────────────────

interface TooltipProps {
  content: string;
  children: React.ReactNode;
}

function Tooltip({ content, children }: TooltipProps) {
  const [show, setShow] = useState(false);

  return (
    <div
      className="relative"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <div
          className="pointer-events-none absolute left-full ml-3 top-1/2 -translate-y-1/2 z-[200] whitespace-nowrap rounded-md bg-popover px-3 py-1.5 text-xs font-medium text-popover-foreground shadow-lg border border-border"
          style={{ animation: "fadeIn 150ms ease" }}
        >
          {content}
          {/* Arrow pointing left toward the button */}
          <span
            className="absolute right-full top-1/2 -translate-y-1/2 border-y-4 border-y-transparent border-r-4 border-r-popover"
            aria-hidden="true"
          />
        </div>
      )}
    </div>
  );
}

// ─── Sidebar Button ──────────────────────────────────────────────────────────

interface SidebarButtonProps {
  icon: React.ReactNode;
  tooltip: string;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
  badge?: boolean;
  spinning?: boolean;
  className?: string;
}

function SidebarButton({
  icon,
  tooltip,
  onClick,
  disabled = false,
  active = false,
  badge = false,
  spinning = false,
  className = "",
}: SidebarButtonProps) {
  return (
    <Tooltip content={tooltip}>
      <button
        onClick={onClick}
        disabled={disabled}
        className={`flex h-10 w-10 items-center justify-center rounded-lg border transition-all duration-200 relative ${
          active
            ? "border-teal/50 bg-teal/10 text-teal"
            : "border-border bg-background text-muted-foreground hover:border-teal/60 hover:bg-accent hover:text-foreground hover:shadow-sm hover:-translate-y-px"
        } ${disabled ? "cursor-not-allowed opacity-40" : ""} ${className}`}
      >
        <span className={spinning ? "animate-spin" : ""}>{icon}</span>
        {badge && (
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-teal ring-1 ring-surface" />
        )}
      </button>
    </Tooltip>
  );
}

// ─── Divider ─────────────────────────────────────────────────────────────────

function IconDivider() {
  return <div className="my-1 h-px w-8 shrink-0 self-center bg-border/60" />;
}

// ─── Workspace Pill ───────────────────────────────────────────────────────────

interface WorkspacePillProps {
  workspace: "app" | "erd";
  onChangeWorkspace: (ws: "app" | "erd") => void;
}

function WorkspacePill({ workspace, onChangeWorkspace }: WorkspacePillProps) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-lg border border-border bg-background p-1 w-10">
      <Tooltip content="App Journey">
        <button
          onClick={() => onChangeWorkspace("app")}
          className={`flex h-8 w-8 items-center justify-center rounded-md transition-all ${
            workspace === "app"
              ? "bg-teal/15 text-teal"
              : "text-muted-foreground hover:bg-accent hover:text-foreground hover:scale-105"
          }`}
        >
          <Workflow className="h-3.5 w-3.5" />
        </button>
      </Tooltip>
      <Tooltip content="Database ERD">
        <button
          onClick={() => onChangeWorkspace("erd")}
          className={`flex h-8 w-8 items-center justify-center rounded-md transition-all ${
            workspace === "erd"
              ? "bg-teal/15 text-teal"
              : "text-muted-foreground hover:bg-accent hover:text-foreground hover:scale-105"
          }`}
        >
          <Database className="h-3.5 w-3.5" />
        </button>
      </Tooltip>
    </div>
  );
}

// ─── Props ───────────────────────────────────────────────────────────────────

export interface IconSidebarProps {
  workspace: "app" | "erd";
  zoom: number;
  isDemoMode: boolean;
  isDraftMode: boolean;
  isLoading: boolean;
  isResettingLayout: boolean;
  nodes: { id: string }[];
  hasSelection: boolean;
  autoLayout: boolean;
  smartRoute: boolean;
  wireStyle: "curvy" | "straight" | "orthogonal";
  simulationOpen: boolean;
  insightsOpen: boolean;
  astInspectorOpen: boolean;
  liveTrafficActive: boolean;
  webhookSyncOpen: boolean;
  webhookSyncConnected: boolean;
  hasPendingWebhookSync: boolean;
  multiplayerOpen: boolean;
  multiplayerConnected: boolean;
  collaboratorCount: number;
  gitDiffOpen: boolean;
  gitDiffCount: number;
  bottleneckCount: number;
  codePreviewOpen: boolean;
  erdGuideOpen: boolean;
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
  onSetWireStyle: (style: "curvy" | "straight" | "orthogonal") => void;
  onToggleSimulation: () => void;
  onToggleInsights: () => void;
  onToggleAstInspector: () => void;
  onToggleLiveTraffic: () => void;
  onToggleWebhookSync: () => void;
  onToggleMultiplayer: () => void;
  onToggleAnnotations: () => void;
  annotationCount: number;
  annotationOpen: boolean;
  onToggleGitDiff: () => void;
  onToggleCodePreview: () => void;
  onExportScaffold: () => void;
  onExportApiTests: () => void;
  // ERD-specific
  onImportSchema: () => void;
  onExportSchema: () => void;
  onToggleErdGuide: () => void;
  aiGuideOpen: boolean;
  onToggleAiGuide: () => void;
}

export function IconSidebar({
  workspace,
  zoom,
  isDemoMode,
  isDraftMode,
  isLoading,
  isResettingLayout,
  nodes,
  hasSelection,
  autoLayout,
  smartRoute,
  wireStyle,
  simulationOpen,
  insightsOpen,
  astInspectorOpen,
  liveTrafficActive,
  webhookSyncOpen,
  webhookSyncConnected,
  hasPendingWebhookSync,
  multiplayerOpen,
  multiplayerConnected,
  collaboratorCount,
  gitDiffOpen,
  gitDiffCount,
  bottleneckCount,
  codePreviewOpen,
  erdGuideOpen,
  onZoomIn,
  onZoomOut,
  onRecenter,
  onRefresh,
  onResetLayout,
  onExportJSON,
  onImportJSON,
  onChangeWorkspace,
  onToggleAutoLayout,
  onToggleSmartRoute,
  onSetWireStyle,
  onToggleSimulation,
  onToggleInsights,
  onToggleAstInspector,
  onToggleLiveTraffic,
  onToggleWebhookSync,
  onToggleMultiplayer,
  onToggleAnnotations,
  annotationCount,
  annotationOpen,
  onToggleGitDiff,
  onToggleCodePreview,
  onExportScaffold,
  onExportApiTests,
  onImportSchema,
  onExportSchema,
  onToggleErdGuide,
  aiGuideOpen,
  onToggleAiGuide,
}: IconSidebarProps) {
  const wireStyleIcon = {
    curvy: <Spline className="h-4 w-4" />,
    straight: <Minus className="h-4 w-4" />,
    orthogonal: <CornerDownRight className="h-4 w-4" />,
  };

  const wireStyleTooltip = {
    curvy: "Wire Style: Curvy (click to cycle)",
    straight: "Wire Style: Straight (click to cycle)",
    orthogonal: "Wire Style: Orthogonal (click to cycle)",
  };

  const cycleWireStyle = useCallback(() => {
    const styles: Array<"curvy" | "straight" | "orthogonal"> = ["curvy", "straight", "orthogonal"];
    const next = (styles.indexOf(wireStyle) + 1) % styles.length;
    onSetWireStyle(styles[next]);
  }, [wireStyle, onSetWireStyle]);

  return (
    <aside className="fixed left-0 top-0 z-50 flex h-full w-14 flex-col items-center border-r border-border bg-surface">
      {/* ─── Logo ── (non-scrolling) */}
      <div className="flex shrink-0 flex-col items-center gap-2 border-b border-border pt-3 pb-2 w-full">
        <Tooltip content="Home">
          <a
            href="/"
            className="flex h-10 w-10 items-center justify-center rounded-lg text-foreground transition-all duration-200 hover:bg-accent hover:text-teal hover:shadow-sm"
          >
            <Zap className="h-5 w-5" />
          </a>
        </Tooltip>
        <WorkspacePill workspace={workspace} onChangeWorkspace={onChangeWorkspace} />
      </div>

      {/* ─── Scrollable Body ── */}
      <div className="flex flex-1 flex-col items-center gap-1 overflow-y-auto overflow-x-hidden py-2 w-full scrollbar-thin">

        {/* Zoom */}
        <div className="flex flex-col items-center gap-0.5 rounded-lg border border-border bg-background p-1 w-10">
          <SidebarButton icon={<Plus className="h-4 w-4" />} tooltip="Zoom In" onClick={onZoomIn} disabled={zoom >= 200} />
          <span className="text-[9px] font-mono text-muted-foreground tabular-nums py-0.5">{zoom}%</span>
          <SidebarButton icon={<Minus className="h-4 w-4" />} tooltip="Zoom Out" onClick={onZoomOut} disabled={zoom <= 25} />
        </div>

        <SidebarButton icon={<Home className="h-4 w-4" />} tooltip="Recenter Canvas" onClick={onRecenter} />

        <SidebarButton
          icon={<RefreshCw className="h-4 w-4" />}
          tooltip="Refresh from Database"
          onClick={onRefresh}
          disabled={isLoading || isDemoMode || isDraftMode}
          spinning={isLoading}
        />

        <IconDivider />

        {/* ─── App Journey Controls ─────────────────────────────────────────── */}
        {workspace === "app" && (
          <>
            <SidebarButton
              icon={<GitBranch className="h-4 w-4" />}
              tooltip="Reset to ELK Auto-Layout"
              onClick={onResetLayout}
              disabled={isResettingLayout || isDemoMode || isDraftMode || nodes.length === 0}
              spinning={isResettingLayout}
            />

            <SidebarButton
              icon={<Magnet className="h-4 w-4" />}
              tooltip={`Auto-Layout: ${autoLayout ? "ON" : "OFF"}`}
              onClick={onToggleAutoLayout}
              active={autoLayout}
            />

            <SidebarButton
              icon={<Spline className="h-4 w-4" />}
              tooltip={`Smart Routing: ${smartRoute ? "ON" : "OFF"}`}
              onClick={onToggleSmartRoute}
              active={smartRoute}
            />

            <SidebarButton
              icon={wireStyleIcon[wireStyle]}
              tooltip={wireStyleTooltip[wireStyle]}
              onClick={cycleWireStyle}
            />

            <IconDivider />
          </>
        )}

        {/* ─── ERD Controls ──────────────────────────────────────────────────── */}
        {workspace === "erd" && (
          <>
            <SidebarButton
              icon={<Database className="h-4 w-4" />}
              tooltip="Import DDL Schema"
              onClick={onImportSchema}
            />

            <SidebarButton
              icon={<Download className="h-4 w-4" />}
              tooltip="Export Schema as SQL"
              onClick={onExportSchema}
              disabled={nodes.length === 0}
            />

            <SidebarButton
              icon={<BookOpen className="h-4 w-4" />}
              tooltip="Cardinality Guide"
              onClick={onToggleErdGuide}
              active={erdGuideOpen}
            />

            <SidebarButton
              icon={<ShieldCheck className="h-4 w-4" />}
              tooltip="AI Interaction Protocols"
              onClick={onToggleAiGuide}
              active={aiGuideOpen}
            />

            <IconDivider />
          </>
        )}

        {/* ─── Import / Export ─────────────────────────────────────────────── */}
        <SidebarButton icon={<Download className="h-4 w-4" />} tooltip="Export Canvas as JSON" onClick={onExportJSON} />
        <SidebarButton icon={<Upload className="h-4 w-4" />} tooltip="Import Canvas from JSON" onClick={onImportJSON} />

        {workspace === "app" && (
          <>
            <SidebarButton icon={<FileCode2 className="h-4 w-4" />} tooltip="Export Code Scaffold" onClick={onExportScaffold} />
            <SidebarButton icon={<Inbox className="h-4 w-4" />} tooltip="Export API Tests" onClick={onExportApiTests} />
          </>
        )}

        <IconDivider />

        {/* ─── Simulation & Analysis (App only) ───────────────────────────── */}
        {workspace === "app" && (
          <>
            <SidebarButton
              icon={<Play className="h-4 w-4" />}
              tooltip="Simulation Mode"
              onClick={onToggleSimulation}
              active={simulationOpen}
            />

            <SidebarButton
              icon={<Eye className="h-4 w-4" />}
              tooltip={`System Insights${bottleneckCount > 0 ? ` (${bottleneckCount} issues)` : ""}`}
              onClick={onToggleInsights}
              active={insightsOpen}
              badge={bottleneckCount > 0}
            />

            <SidebarButton
              icon={<Settings2 className="h-4 w-4" />}
              tooltip="AST Inspector"
              onClick={onToggleAstInspector}
              active={astInspectorOpen}
            />

            <SidebarButton
              icon={<Activity className="h-4 w-4" />}
              tooltip="Live Traffic Simulation"
              onClick={onToggleLiveTraffic}
              active={liveTrafficActive}
              badge={liveTrafficActive}
            />

            <IconDivider />

            {/* ─── Collaboration ────────────────────────────────────────────── */}
            <SidebarButton
              icon={<Cloud className="h-4 w-4" />}
              tooltip={`Webhook Sync — ${webhookSyncConnected ? "Connected" : "Disconnected"}`}
              onClick={onToggleWebhookSync}
              active={webhookSyncOpen}
              badge={hasPendingWebhookSync}
            />

            <SidebarButton
              icon={<Users className="h-4 w-4" />}
              tooltip={`Multiplayer — ${collaboratorCount} collaborator${collaboratorCount !== 1 ? "s" : ""}`}
              onClick={onToggleMultiplayer}
              active={multiplayerOpen}
              badge={multiplayerOpen && collaboratorCount > 0}
            />

            <SidebarButton
              icon={<MessageCircle className="h-4 w-4" />}
              tooltip={`Annotations — ${annotationCount} active`}
              onClick={onToggleAnnotations}
              active={annotationOpen}
              badge={annotationCount > 0}
            />

            <SidebarButton
              icon={<GitCompare className="h-4 w-4" />}
              tooltip={`Git PR Diff${gitDiffCount > 0 ? ` — ${gitDiffCount} changes` : ""}`}
              onClick={onToggleGitDiff}
              active={gitDiffOpen}
              badge={gitDiffCount > 0}
            />

            <SidebarButton
              icon={<FileCode2 className="h-4 w-4" />}
              tooltip="Code Preview"
              onClick={onToggleCodePreview}
              active={codePreviewOpen}
              badge={hasSelection && codePreviewOpen}
            />
          </>
        )}
      </div>
    </aside>
  );
}
