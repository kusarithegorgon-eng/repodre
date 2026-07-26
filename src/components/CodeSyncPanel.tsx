/**
 * CodeSyncPanel — Two-Way Code Sync Side Panel
 *
 * Displays live code-change suggestions generated from canvas mutations.
 * Updates in real time as the user adds, moves, renames, or connects nodes.
 * Each suggestion shows a diff preview and an "apply" action (download).
 */

import { useMemo, useState, useCallback } from "react";
import { X, FileCode2, FilePlus, FileMinus, ArrowRightLeft, GitBranch, Download, Check, ChevronDown, ChevronRight, RefreshCw } from "lucide-react";
import type { CodeChange } from "@/lib/code-sync-engine";
import { generateDiff } from "@/lib/code-sync-engine";

interface CodeSyncPanelProps {
  isOpen: boolean;
  onClose: () => void;
  /** pending code-change suggestions generated from canvas mutations */
  changes: CodeChange[];
  /** clear all pending changes */
  onClear: () => void;
}

export function CodeSyncPanel({ isOpen, onClose, changes, onClear }: CodeSyncPanelProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set());

  const handleApply = useCallback((change: CodeChange) => {
    if (change.newContent) {
      const blob = new Blob([change.newContent], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = change.filePath.split("/").pop() || "file.txt";
      a.click();
      URL.revokeObjectURL(url);
    }
    setAppliedIds((prev) => new Set(prev).add(change.id));
  }, []);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-40 flex w-96 flex-col border-l border-border bg-popover shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <ArrowRightLeft className="h-4 w-4 text-teal" />
          <div>
            <h3 className="text-sm font-semibold text-foreground">Code Sync</h3>
            <p className="text-[10px] text-muted-foreground">
              {changes.length} pending suggestion{changes.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {changes.length > 0 && (
            <button
              onClick={onClear}
              title="Clear all suggestions"
              className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={onClose}
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Live indicator */}
      <div className="flex items-center gap-2 border-b border-border bg-teal/5 px-4 py-2">
        <span className="h-2 w-2 animate-pulse rounded-full bg-teal" />
        <span className="text-[10px] font-medium text-teal">
          Live sync active — canvas edits generate code suggestions
        </span>
      </div>

      {/* Changes list */}
      <div className="flex-1 overflow-y-auto">
        {changes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <FileCode2 className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <p className="text-sm text-muted-foreground">No pending code changes</p>
            <p className="mt-1 text-xs text-muted-foreground/60">
              Add, rename, or connect nodes on the canvas to generate code suggestions
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {changes.map((change) => {
              const isExpanded = expandedId === change.id;
              const isApplied = appliedIds.has(change.id);
              const Icon = change.type === "create-file" ? FilePlus :
                change.type === "delete-file" ? FileMinus :
                change.type === "rename-file" ? GitBranch : FileCode2;

              return (
                <div key={change.id} className={`p-3 transition-colors ${isApplied ? "bg-green-500/5" : ""}`}>
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : change.id)}
                    className="flex w-full items-start gap-2 text-left"
                  >
                    {isExpanded ? (
                      <ChevronDown className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    )}
                    <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${
                      change.type === "create-file" ? "bg-green-500/10 text-green-500" :
                      change.type === "delete-file" ? "bg-red-500/10 text-red-500" :
                      change.type === "rename-file" ? "bg-amber-500/10 text-amber-500" :
                      "bg-blue-500/10 text-blue-500"
                    }`}>
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground">{change.description}</p>
                      <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">{change.filePath}</p>
                    </div>
                    {isApplied && <Check className="h-4 w-4 shrink-0 text-green-500" />}
                  </button>

                  {isExpanded && (
                    <div className="mt-2 ml-6">
                      {change.newContent && (
                        <pre className="max-h-48 overflow-auto rounded-lg border border-border bg-[#1e1e2e] p-3 font-mono text-[10px] leading-relaxed text-green-300">
                          {generateDiff(change)}
                        </pre>
                      )}
                      <div className="mt-2 flex items-center gap-2">
                        <button
                          onClick={() => handleApply(change)}
                          disabled={isApplied}
                          className="flex items-center gap-1.5 rounded-md bg-teal px-2.5 py-1 text-[10px] font-medium text-white transition-colors hover:bg-teal/90 disabled:opacity-40"
                        >
                          {isApplied ? <Check className="h-3 w-3" /> : <Download className="h-3 w-3" />}
                          {isApplied ? "Applied" : "Apply (download)"}
                        </button>
                        <span className="text-[10px] text-muted-foreground">
                          {change.language.toUpperCase()} · {change.sourceMutation}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer summary */}
      {changes.length > 0 && (
        <div className="border-t border-border px-4 py-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              {appliedIds.size} of {changes.length} applied
            </span>
            <button
              onClick={() => {
                changes.forEach((c) => !appliedIds.has(c.id) && handleApply(c));
              }}
              className="text-teal hover:underline"
            >
              Apply all
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function CodeSyncToggle({
  isActive,
  onClick,
  pendingCount,
}: {
  isActive: boolean;
  onClick: () => void;
  pendingCount: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-medium transition-all ${
        isActive
          ? "border-teal/50 bg-teal/10 text-teal"
          : "border-border bg-background text-muted-foreground hover:border-teal hover:text-teal"
      }`}
    >
      <ArrowRightLeft className="h-3.5 w-3.5" />
      <span>Code Sync</span>
      {pendingCount > 0 && (
        <span className="flex h-5 items-center justify-center rounded-full bg-teal/20 px-1.5 text-[10px] font-semibold text-teal">
          {pendingCount}
        </span>
      )}
    </button>
  );
}
