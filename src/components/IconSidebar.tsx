/**
 * IconSidebar — Fixed Vertical Toolbar
 *
 * A minimalist, icon-only vertical sidebar that houses primary canvas controls.
 * Each button has a hover tooltip for accessibility.
 */

import { useState, useCallback } from "react";
import {
  LayoutGrid as Layout,
  Download,
  Upload,
  Activity,
  Play,
  FileCode2,
  GitBranch,
  RefreshCw,
  Plus,
  Minus,
  Settings2,
  Spline,
  Magnet,
  CornerDownRight,
  Server,
  Cloud,
  Users,
  GitCompare,
  Eye,
  Shield,
  Zap,
  Trash2,
  Inbox,
} from "lucide-react";
import { RecenterButton } from "@/hooks/useCanvasPan.tsx";

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
        <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 z-[100] whitespace-nowrap rounded-md bg-popover px-3 py-1.5 text-xs font-medium text-popover-foreground shadow-lg border border-border animate-in fade-in slide-in-from-left-2 duration-200">
          {content}
        </div>
      )}
    </div>
  );
}

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
            : "border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground"
        } ${disabled ? "cursor-not-allowed opacity-50" : ""} ${className}`}
      >
        {spinning ? (
          <span className="animate-spin">{icon}</span>
        ) : (
          icon
        )}
        {badge && (
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-teal" />
        )}
      </button>
    </Tooltip>
  );
}

interface IconDividerProps {
  label?: string;
}

function IconDivider({ label }: IconDividerProps) {
  return (
    <div className="flex flex-col items-center gap-1 py-2">
      <div className="h-px w-6 bg-border" />
      {label && (
        <span className="text-[9px] font-medium text-muted-foreground uppercase tracking-wider">
          {label}
        </span>
      )}
    </div>
  );
}

interface IconSidebarProps {
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
  onZoomIn: () => void;
  onZoomOut: () => void;
  onRecenter: () => void;
  onRefresh: () => void;
  onResetLayout: () => void;
  onExportJSON: () => void;
  onImportJSON: () => void;
  onToggleAutoLayout: () => void;
  onToggleSmartRoute: () => void;
  onSetWireStyle: (style: "curvy" | "straight" | "orthogonal") => void;
  onToggleSimulation: () => void;
  onToggleInsights: () => void;
  onToggleAstInspector: () => void;
  onToggleLiveTraffic: () => void;
  onToggleWebhookSync: () => void;
  onToggleMultiplayer: () => void;
  onToggleGitDiff: () => void;
  onToggleCodePreview: () => void;
  onExportScaffold: () => void;
  onExportApiTests: () => void;
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
  onZoomIn,
  onZoomOut,
  onRecenter,
  onRefresh,
  onResetLayout,
  onExportJSON,
  onImportJSON,
  onToggleAutoLayout,
  onToggleSmartRoute,
  onSetWireStyle,
  onToggleSimulation,
  onToggleInsights,
  onToggleAstInspector,
  onToggleLiveTraffic,
  onToggleWebhookSync,
  onToggleMultiplayer,
  onToggleGitDiff,
  onToggleCodePreview,
  onExportScaffold,
  onExportApiTests,
}: IconSidebarProps) {
  const wireStyleIcon = {
    curvy: <Spline className="h-4 w-4" />,
    straight: <Minus className="h-4 w-4" />,
    orthogonal: <CornerDownRight className="h-4 w-4" />,
  };

  const wireStyleLabel = {
    curvy: "Curvy Wires",
    straight: "Straight Wires",
    orthogonal: "Orthogonal Wires",
  };

  const cycleWireStyle = useCallback(() => {
    const styles: Array<"curvy" | "straight" | "orthogonal"> = ["curvy", "straight", "orthogonal"];
    const currentIndex = styles.indexOf(wireStyle);
    const nextIndex = (currentIndex + 1) % styles.length;
    onSetWireStyle(styles[nextIndex]);
  }, [wireStyle, onSetWireStyle]);

  return (
    <aside className="fixed left-0 top-0 z-50 flex h-full w-14 flex-col items-center gap-1 border-r border-border bg-surface py-3">
      {/* ─── Logo / Home ─────────────────────────────────────────────────────── */}
      <div className="mb-2 flex h-10 w-10 items-center justify-center">
        <a href="/" className="text-foreground hover:text-teal transition-colors">
          <Zap className="h-5 w-5" />
        </a>
      </div>

      <IconDivider />

      {/* ─── Zoom Controls ───────────────────────────────────────────────────── */}
      <div className="flex flex-col items-center gap-1 rounded-lg border border-border bg-background p-1">
        <SidebarButton
          icon={<Plus className="h-4 w-4" />}
          tooltip="Zoom In"
          onClick={onZoomIn}
          disabled={zoom >= 200}
        />
        <span className="text-[10px] font-mono text-muted-foreground tabular-nums">
          {zoom}%
        </span>
        <SidebarButton
          icon={<Minus className="h-4 w-4" />}
          tooltip="Zoom Out"
          onClick={onZoomOut}
          disabled={zoom <= 25}
        />
      </div>

      <SidebarButton
        icon={<RefreshCw className="h-4 w-4" />}
        tooltip="Recenter Canvas"
        onClick={onRecenter}
      />

      <SidebarButton
        icon={<RefreshCw className="h-4 w-4" />}
        tooltip="Refresh from Database"
        onClick={onRefresh}
        disabled={isLoading || isDemoMode || isDraftMode}
        spinning={isLoading}
      />

      <IconDivider />

      {/* ─── Layout Controls (App only) ───────────────────────────────────────── */}
      {workspace === "app" && (
        <>
          <SidebarButton
            icon={<GitBranch className="h-4 w-4" />}
            tooltip="Reset to Auto-Layout (ELK)"
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
            tooltip={`Wire Style: ${wireStyleLabel[wireStyle]}`}
            onClick={cycleWireStyle}
          />
        </>
      )}

      <IconDivider />

      {/* ─── Import / Export ───────────────────────────────────────────────────── */}
      <SidebarButton
        icon={<Download className="h-4 w-4" />}
        tooltip="Export Canvas as JSON"
        onClick={onExportJSON}
      />

      <SidebarButton
        icon={<Upload className="h-4 w-4" />}
        tooltip="Import Canvas from JSON"
        onClick={onImportJSON}
      />

      {workspace === "app" && (
        <SidebarButton
          icon={<FileCode2 className="h-4 w-4" />}
          tooltip="Export Code Scaffold"
          onClick={onExportScaffold}
        />
      )}

      {workspace === "app" && (
        <SidebarButton
          icon={<Inbox className="h-4 w-4" />}
          tooltip="Export API Tests"
          onClick={onExportApiTests}
        />
      )}

      <IconDivider />

      {/* ─── Simulation & Analysis (App only) ───────────────────────────────────── */}
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
            tooltip="System Insights"
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
        </>
      )}

      <IconDivider />

      {/* ─── Collaboration (App only) ──────────────────────────────────────────── */}
      {workspace === "app" && (
        <>
          <SidebarButton
            icon={<Cloud className="h-4 w-4" />}
            tooltip={`Webhook Sync (${webhookSyncConnected ? "Connected" : "Disconnected"})`}
            onClick={onToggleWebhookSync}
            active={webhookSyncOpen}
            badge={hasPendingWebhookSync}
          />

          <SidebarButton
            icon={<Users className="h-4 w-4" />}
            tooltip={`Multiplayer (${collaboratorCount} active)`}
            onClick={onToggleMultiplayer}
            active={multiplayerOpen}
            badge={multiplayerOpen && collaboratorCount > 0}
          />

          <SidebarButton
            icon={<GitCompare className="h-4 w-4" />}
            tooltip="Git PR Diff"
            onClick={onToggleGitDiff}
            active={gitDiffOpen}
            badge={gitDiffCount > 0}
          />

          <SidebarButton
            icon={<FileCode2 className="h-4 w-4" />}
            tooltip="Code Preview"
            onClick={onToggleCodePreview}
            active={codePreviewOpen}
            badge={hasSelection}
          />
        </>
      )}
    </aside>
  );
}
