/**
 * WebhookSyncPanel — Live Repo Webhook Sync Control Panel
 *
 * Displays incoming webhook events and triggers canvas updates
 * with smooth fade-in transitions for live code synchronization.
 */

import { useState, useCallback } from "react";
import { GitBranch, GitCommitVertical as GitCommit, Webhook, FolderSync as Sync, ChevronDown, ChevronRight, FilePlus, FileMinus, File as FileEdit, X, Zap, Loader as Loader2 } from "lucide-react";
import type { WebhookEvent, CommitInfo, FileChange, NodeMutation } from "@/lib/webhook-sync";
import { generateMockWebhookEvent, parseWebhookToMutations } from "@/lib/webhook-sync";

interface WebhookSyncPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onWebhookEvent?: (event: WebhookEvent, mutations: NodeMutation[]) => void;
  isConnected: boolean;
  lastEvent: WebhookEvent | null;
}

export function WebhookSyncPanel({
  isOpen,
  onClose,
  onWebhookEvent,
  isConnected,
  lastEvent,
}: WebhookSyncPanelProps) {
  const [expandedCommit, setExpandedCommit] = useState<string | null>(null);

  if (!isOpen) return null;

  return (
    <div className="absolute left-4 bottom-4 z-40 w-96 rounded-xl border border-border bg-popover/95 p-4 shadow-2xl backdrop-blur">
      <div className="mb-3 flex items-start justify-between">
        <div className="flex items-center gap-2">
          <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${isConnected ? "bg-green-500/10" : "bg-red-500/10"}`}>
            <Webhook className={`h-4 w-4 ${isConnected ? "text-green-500" : "text-red-500"}`} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Live Repo Sync</h3>
            <p className="text-[10px] text-muted-foreground">
              {isConnected ? "Listening for webhook events..." : "Disconnected"}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Connection status */}
      <div className="mb-3 flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${isConnected ? "bg-green-500 animate-pulse" : "bg-red-500"}`} />
        <span className="text-xs text-muted-foreground">
          Endpoint: <code className="font-mono text-[10px]">/api/webhooks/sync</code>
        </span>
      </div>

      {/* Latest event */}
      {lastEvent ? (
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Latest Event</p>
          <EventCard
            event={lastEvent}
            expanded={expandedCommit}
            onToggleCommit={(hash) => setExpandedCommit(expandedCommit === hash ? null : hash)}
          />
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border p-6 text-center">
          <GitBranch className="mx-auto h-8 w-8 text-muted-foreground/50" />
          <p className="mt-2 text-xs text-muted-foreground">No webhook events received yet</p>
          <p className="text-[10px] text-muted-foreground">Trigger a mock event to simulate deployment</p>
        </div>
      )}
    </div>
  );
}

function EventCard({
  event,
  expanded,
  onToggleCommit,
}: {
  event: WebhookEvent;
  expanded: string | null;
  onToggleCommit: (hash: string) => void;
}) {
  const totalAdditions = event.commits.reduce((sum, c) => sum + c.files.reduce((s, f) => s + f.additions, 0), 0);
  const totalDeletions = event.commits.reduce((sum, c) => sum + c.files.reduce((s, f) => s + f.deletions, 0), 0);

  return (
    <div className="rounded-lg border border-border bg-background">
      {/* Event header */}
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="flex-1 font-mono text-xs text-foreground">{event.branch}</span>
        <span className="text-[10px] text-muted-foreground">
          {event.timestamp.toLocaleTimeString()}
        </span>
      </div>

      {/* Author */}
      <div className="border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-teal/20">
            <span className="text-[10px] font-semibold text-teal">{event.author.charAt(0)}</span>
          </div>
          <span className="text-xs text-foreground">{event.author}</span>
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 border-b border-border px-3 py-2">
        <span className="flex items-center gap-1 text-xs text-green-500">
          <FilePlus className="h-3 w-3" />
          +{totalAdditions}
        </span>
        <span className="flex items-center gap-1 text-xs text-red-500">
          <FileMinus className="h-3 w-3" />
          -{totalDeletions}
        </span>
        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <GitCommit className="h-3 w-3" />
          {event.commits.length} commits
        </span>
      </div>

      {/* Commits list */}
      <div className="max-h-48 overflow-auto">
        {event.commits.map((commit) => (
          <CommitRow
            key={commit.hash}
            commit={commit}
            expanded={expanded === commit.hash}
            onToggle={() => onToggleCommit(commit.hash)}
          />
        ))}
      </div>
    </div>
  );
}

function CommitRow({
  commit,
  expanded,
  onToggle,
}: {
  commit: CommitInfo;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="border-b border-border last:border-b-0">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-accent transition-colors"
      >
        {expanded ? (
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3 w-3 text-muted-foreground" />
        )}
        <code className="font-mono text-[10px] text-muted-foreground">{commit.hash.slice(0, 7)}</code>
        <span className="flex-1 truncate text-xs text-foreground">{commit.message}</span>
      </button>

      {expanded && (
        <div className="bg-surface px-3 pb-2 space-y-1">
          {commit.files.map((file, i) => (
            <FileChangeRow key={i} file={file} />
          ))}
        </div>
      )}
    </div>
  );
}

function FileChangeRow({ file }: { file: FileChange }) {
  const Icon = file.type === "added" ? FilePlus : file.type === "deleted" ? FileMinus : FileEdit;
  const statusColor =
    file.type === "added" ? "text-green-500" :
    file.type === "deleted" ? "text-red-500" :
    "text-blue-500";

  return (
    <div className="flex items-center gap-2 rounded-md bg-background px-2 py-1">
      <Icon className={`h-3 w-3 ${statusColor}`} />
      <span className="flex-1 truncate font-mono text-[10px] text-muted-foreground">{file.path}</span>
      <span className="text-[9px] text-green-500">+{file.additions}</span>
      <span className="text-[9px] text-red-500">-{file.deletions}</span>
    </div>
  );
}

export function WebhookSyncToggle({
  isActive,
  onClick,
  isConnected,
  hasPendingSync,
}: {
  isActive: boolean;
  onClick: () => void;
  isConnected: boolean;
  hasPendingSync?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title="Webhook sync — connect external repo updates"
      className={`relative flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-medium transition-all ${
        isActive
          ? "border-teal/50 bg-teal/10 text-teal"
          : "border-border bg-background text-muted-foreground hover:border-teal hover:text-teal"
      }`}
    >
      <Webhook className="h-3.5 w-3.5" />
      <span>Webhook Sync</span>
      <span className={`h-1.5 w-1.5 rounded-full ${isConnected ? "bg-green-500 animate-pulse" : "bg-red-500"}`} />

      {hasPendingSync && (
        <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-orange text-[8px] text-white">
          !
        </span>
      )}
    </button>
  );
}

export function useWebhookSync(
  nodes: Array<{ id: string; label: string; sub: string; shape: string; x: number; y: number; workspace: string }>,
  onMutations: (mutations: NodeMutation[]) => void
) {
  const [isConnected, setIsConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<WebhookEvent | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const connect = useCallback(() => {
    setIsConnected(true);
  }, []);

  const disconnect = useCallback(() => {
    setIsConnected(false);
  }, []);

  const triggerMockEvent = useCallback(() => {
    if (!isConnected) return;

    setIsProcessing(true);

    // Simulate network delay
    setTimeout(() => {
      const event = generateMockWebhookEvent();
      const mutations = parseWebhookToMutations(
        event,
        nodes.map((n) => ({
          id: n.id,
          label: n.label,
          sub: n.sub,
          shape: n.shape,
          accent: "teal",
          x: n.x,
          y: n.y,
          workspace: n.workspace,
        }))
      );

      setLastEvent(event);
      onMutations(mutations);
      setIsProcessing(false);
    }, 500 + Math.random() * 1000);
  }, [isConnected, nodes, onMutations]);

  return {
    isConnected,
    lastEvent,
    isProcessing,
    connect,
    disconnect,
    triggerMockEvent,
  };
}
