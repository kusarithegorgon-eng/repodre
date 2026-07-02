/**
 * GitDiffOverlay — Visual PR Diff View Layer
 *
 * Toggles visual diff mode on the canvas, styling nodes to show:
 * - Green borders: newly added routes
 * - Red strikethrough banners: deleted code segments
 * - Orange/yellow warnings: merge conflicts
 */

import { useState, useCallback } from "react";
import { GitPullRequest, Plus, Minus, TriangleAlert as AlertTriangle, FileText, RefreshCw, X } from "lucide-react";
import type { DiffResult, DiffStatus, NodeDiff } from "@/lib/git-diff-engine";
import { computeNodeDiff, generateMockPrDiff, getDiffStatusClasses } from "@/lib/git-diff-engine";

interface GitDiffOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  diffResult: DiffResult | null;
  onApplyDiff?: () => void;
  onRevertDiff?: () => void;
}

export function GitDiffOverlay({
  isOpen,
  onClose,
  diffResult,
  onApplyDiff,
  onRevertDiff,
}: GitDiffOverlayProps) {
  if (!isOpen) return null;

  const statusCounts = {
    added: diffResult?.addedCount || 0,
    deleted: diffResult?.deletedCount || 0,
    modified: diffResult?.modifiedCount || 0,
    conflicts: diffResult?.conflictCount || 0,
  };

  return (
    <div className="absolute right-4 top-4 z-50 w-80 rounded-xl border border-border bg-popover/95 p-4 shadow-2xl backdrop-blur">
      <div className="mb-3 flex items-start justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/10">
            <GitPullRequest className="h-4 w-4 text-purple-500" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">PR Diff View</h3>
            <p className="text-[10px] text-muted-foreground">Visual merge diagnostics</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Summary stats */}
      <div className="mb-3 grid grid-cols-4 gap-2">
        <StatusStat status="added" count={statusCounts.added} label="Added" icon={Plus} />
        <StatusStat status="deleted" count={statusCounts.deleted} label="Deleted" icon={Minus} />
        <StatusStat status="modified" count={statusCounts.modified} label="Changed" icon={RefreshCw} />
        <StatusStat status="conflict" count={statusCounts.conflicts} label="Conflicts" icon={AlertTriangle} />
      </div>

      {/* Diff list */}
      {diffResult && diffResult.diffs.length > 0 ? (
        <div className="max-h-64 space-y-2 overflow-auto">
          {diffResult.diffs
            .filter((d) => d.status !== "unchanged")
            .map((diff) => (
              <DiffRow key={diff.id} diff={diff} />
            ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border p-6 text-center">
          <FileText className="mx-auto h-8 w-8 text-muted-foreground/50" />
          <p className="mt-2 text-xs text-muted-foreground">No differences detected</p>
          <p className="text-[10px] text-muted-foreground">Generate a mock diff to test</p>
        </div>
      )}

      {/* Key */}
      <div className="mt-3 border-t border-border pt-3">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Legend
        </p>
        <div className="grid grid-cols-2 gap-2 text-[10px]">
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm border-2 border-green-500 bg-green-500/10" />
            <span className="text-muted-foreground">New route (green)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="relative h-3 w-3 rounded-sm border-2 border-red-500 bg-red-500/10">
              <span className="absolute inset-0 flex items-center">
                <span className="h-0.5 w-full bg-red-500" />
              </span>
            </span>
            <span className="text-muted-foreground">Deleted (strikethrough)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm border-2 border-orange-500 bg-orange-500/10" />
            <span className="text-muted-foreground">Conflict (orange)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm border-2 border-blue-500 bg-blue-500/10" />
            <span className="text-muted-foreground">Modified (blue)</span>
          </div>
        </div>
      </div>

      {/* Actions */}
      {diffResult && (statusCounts.added > 0 || statusCounts.modified > 0 || statusCounts.deleted > 0) && (
        <div className="mt-3 flex gap-2">
          <button
            onClick={onApplyDiff}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-green-500 px-3 py-2 text-xs font-medium text-white hover:bg-green-600 transition-colors"
          >
            <Plus className="h-3 w-3" />
            Apply Changes
          </button>
          <button
            onClick={onRevertDiff}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <RefreshCw className="h-3 w-3" />
            Revert
          </button>
        </div>
      )}
    </div>
  );
}

function StatusStat({
  status,
  count,
  label,
  icon: Icon,
}: {
  status: DiffStatus;
  count: number;
  label: string;
  icon: typeof Plus;
}) {
  const colors = getDiffStatusClasses(status);

  return (
    <div className="flex flex-col items-center rounded-lg border border-border bg-background p-2">
      <Icon className={`h-3.5 w-3.5 ${colors.text}`} />
      <span className={`mt-0.5 font-mono text-xs font-semibold ${colors.text}`}>{count}</span>
      <span className="text-[9px] text-muted-foreground">{label}</span>
    </div>
  );
}

function DiffRow({ diff }: { diff: NodeDiff }) {
  const colors = getDiffStatusClasses(diff.status);
  const node = diff.headNode || diff.baseNode;

  const StatusIcon = {
    added: Plus,
    deleted: Minus,
    modified: RefreshCw,
    conflict: AlertTriangle,
    unchanged: FileText,
  }[diff.status];

  if (!node) return null;

  return (
    <div
      className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 ${colors.border} ${colors.background}`}
    >
      <StatusIcon className={`h-3.5 w-3.5 shrink-0 ${colors.text}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          <span className={`truncate font-mono text-xs ${diff.status === "deleted" ? "line-through text-red-500" : "text-foreground"}`}>
            {node.label}
          </span>
        </div>
        <p className="text-[10px] text-muted-foreground">{node.sub}</p>
      </div>
      <span className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${colors.badge}`}>
        {diff.status.charAt(0).toUpperCase() + diff.status.slice(1)}
      </span>
    </div>
  );
}

export function GitDiffToggle({
  isActive,
  onClick,
  diffCount,
}: {
  isActive: boolean;
  onClick: () => void;
  diffCount: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-medium transition-all ${
        isActive
          ? "border-purple-500/50 bg-purple-500/10 text-purple-500"
          : "border-border bg-background text-muted-foreground hover:border-purple-500 hover:text-purple-500"
      }`}
    >
      <GitPullRequest className="h-3.5 w-3.5" />
      <span>PR Diff</span>
      {diffCount > 0 && (
        <span className="flex h-5 items-center justify-center rounded-full bg-purple-500/20 px-1.5 text-[10px] font-semibold text-purple-500">
          {diffCount}
        </span>
      )}
    </button>
  );
}

/**
 * Hook for managing Git diff state.
 */
export function useGitDiff(
  currentNodes: Array<{ id: string; label: string; sub: string; shape: string; x: number; y: number }>
) {
  const [diffResult, setDiffResult] = useState<DiffResult | null>(null);
  const [baseNodes, setBaseNodes] = useState<typeof currentNodes>([]);

  const generateDiff = useCallback(() => {
    // Store current as base if no base set
    if (baseNodes.length === 0) {
      setBaseNodes(currentNodes);
    }

    const result = generateMockPrDiff(currentNodes);
    setDiffResult(result);
  }, [currentNodes, baseNodes]);

  const clearDiff = useCallback(() => {
    setDiffResult(null);
  }, []);

  const setBase = useCallback(() => {
    setBaseNodes(currentNodes);
  }, [currentNodes]);

  return {
    diffResult,
    baseNodes,
    generateDiff,
    clearDiff,
    setBase,
  };
}

/**
 * Returns style overrides for a node based on its diff status.
 */
export function getDiffNodeStyles(status: DiffStatus): React.CSSProperties {
  const colors = getDiffStatusClasses(status);

  switch (status) {
    case "added":
      return {
        boxShadow: "0 0 0 2px rgba(34, 197, 94, 0.5), 0 0 20px rgba(34, 197, 94, 0.3)",
      };
    case "deleted":
      return {
        opacity: 0.6,
        boxShadow: "0 0 0 2px rgba(239, 68, 68, 0.5)",
      };
    case "conflict":
      return {
        boxShadow: "0 0 0 2px rgba(249, 115, 22, 0.5), 0 0 20px rgba(249, 115, 22, 0.3)",
      };
    case "modified":
      return {
        boxShadow: "0 0 0 2px rgba(59, 130, 246, 0.5), 0 0 12px rgba(59, 130, 246, 0.2)",
      };
    default:
      return {};
  }
}
