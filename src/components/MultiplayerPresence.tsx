/**
 * MultiplayerPresence — Real-Time Collaborative Ghost Cursors
 *
 * Loads real project members from the project_members table and renders
 * them as animated ghost cursors on the canvas.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { Users, Wifi, WifiOff, User, RefreshCw } from "lucide-react";
import type { CollaboratorCursor, PresenceState } from "@/lib/multiplayer-presence";
import {
  initializePresenceState,
  updateCursorPosition,
  toggleConnection as togglePresenceConnectionState,
  loadProjectMembers,
} from "@/lib/multiplayer-presence";

interface MultiplayerPresenceProps {
  isOpen: boolean;
  onClose: () => void;
  canvasRef: React.RefObject<HTMLDivElement>;
  zoom: number;
  nodes: Array<{ id: string; label: string; x: number; y: number }>;
  projectId?: string | null;
  currentUserId?: string | null;
}

export function MultiplayerPresence({
  isOpen,
  onClose,
  canvasRef,
  zoom,
  nodes,
  projectId,
  currentUserId,
}: MultiplayerPresenceProps) {
  const [presenceState, setPresenceState] = useState<PresenceState>(initializePresenceState);
  const [loading, setLoading] = useState(false);
  const animationRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(Date.now());

  // Load real project members when panel opens or project changes
  const fetchMembers = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const collaborators = await loadProjectMembers(projectId, currentUserId);
      setPresenceState((prev) => ({
        ...prev,
        collaborators,
        isConnected: true,
      }));
    } finally {
      setLoading(false);
    }
  }, [projectId, currentUserId]);

  useEffect(() => {
    if (isOpen && projectId) {
      fetchMembers();
    }
  }, [isOpen, projectId, fetchMembers]);

  // Animation loop for cursor movement
  useEffect(() => {
    if (!isOpen || !presenceState.isConnected) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      return;
    }

    const animate = () => {
      const now = Date.now();
      const elapsed = now - lastTimeRef.current;

      if (elapsed > 50) {
        lastTimeRef.current = now;

        setPresenceState((prev) => {
          if (!prev.isConnected) return prev;

          const canvasRect = canvasRef.current?.getBoundingClientRect();
          const canvasWidth = canvasRect?.width || 1200;
          const canvasHeight = canvasRect?.height || 800;

          return {
            ...prev,
            collaborators: prev.collaborators.map((cursor) =>
              updateCursorPosition(cursor, nodes, canvasWidth, canvasHeight, zoom / 100)
            ),
          };
        });
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isOpen, presenceState.isConnected, nodes, zoom, canvasRef]);

  const handleToggleConnection = useCallback(() => {
    setPresenceState((prev) => toggleConnection(prev));
    if (!presenceState.isConnected && projectId) {
      fetchMembers();
    }
  }, [presenceState.isConnected, projectId, fetchMembers]);

  if (!isOpen) return null;

  return (
    <div className="absolute left-4 top-4 z-50 w-72 rounded-xl border border-border bg-popover/95 p-4 shadow-2xl backdrop-blur">
      <div className="mb-3 flex items-start justify-between">
        <div className="flex items-center gap-2">
          <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${presenceState.isConnected ? "bg-teal/10" : "bg-red-500/10"}`}>
            <Users className={`h-4 w-4 ${presenceState.isConnected ? "text-teal" : "text-red-500"}`} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Collaborators</h3>
            <p className="text-[10px] text-muted-foreground">
              {presenceState.isConnected
                ? `${presenceState.collaborators.length} active in session`
                : "Disconnected"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={fetchMembers}
            disabled={loading}
            title="Refresh members"
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={onClose}
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            ×
          </button>
        </div>
      </div>

      {/* Connection toggle */}
      <button
        onClick={handleToggleConnection}
        className={`mb-3 flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-all ${
          presenceState.isConnected
            ? "border-teal/50 bg-teal/10 text-teal"
            : "border-border bg-background text-muted-foreground hover:border-teal hover:text-teal"
        }`}
      >
        {presenceState.isConnected ? (
          <>
            <Wifi className="h-3.5 w-3.5" />
            Connected to "{presenceState.roomName}"
          </>
        ) : (
          <>
            <WifiOff className="h-3.5 w-3.5" />
            Reconnect to Session
          </>
        )}
      </button>

      {/* Collaborator list */}
      <div className="space-y-2">
        {presenceState.collaborators.map((collab) => (
          <CollaboratorRow key={collab.id} collaborator={collab} />
        ))}

        {presenceState.collaborators.length === 0 && !loading && (
          <div className="rounded-lg border border-dashed border-border p-4 text-center">
            <User className="mx-auto h-6 w-6 text-muted-foreground/50" />
            <p className="mt-1 text-xs text-muted-foreground">
              {projectId
                ? "No collaborators yet. Invite members to see them here."
                : "Open a project to load collaborators."}
            </p>
          </div>
        )}

        {loading && (
          <div className="rounded-lg border border-dashed border-border p-4 text-center">
            <RefreshCw className="mx-auto h-5 w-5 animate-spin text-muted-foreground/50" />
            <p className="mt-1 text-xs text-muted-foreground">Loading members...</p>
          </div>
        )}
      </div>

      {/* Session info */}
      <div className="mt-3 border-t border-border pt-3">
        <p className="text-[10px] text-muted-foreground">
          Session ID: <code className="font-mono">{presenceState.sessionId.slice(0, 16)}...</code>
        </p>
      </div>
    </div>
  );
}

function CollaboratorRow({ collaborator }: { collaborator: CollaboratorCursor }) {
  return (
    <div
      className="flex items-center gap-2 rounded-lg border px-2.5 py-2 transition-all"
      style={{
        borderColor: collaborator.color,
        backgroundColor: collaborator.backgroundColor,
      }}
    >
      {/* Avatar */}
      <div
        className="flex h-7 w-7 items-center justify-center rounded-full"
        style={{ background: collaborator.color, color: "white" }}
      >
        <span className="text-[10px] font-bold">{collaborator.name.charAt(0)}</span>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-foreground truncate">{collaborator.name}</span>
          <span className="text-[10px] text-muted-foreground">({collaborator.role})</span>
        </div>
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          {collaborator.isTyping ? (
            <>
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-teal" />
              <span className="italic">typing...</span>
            </>
          ) : (
            <span>{collaborator.currentAction}</span>
          )}
        </div>
      </div>

      {/* Active indicator */}
      <div
        className="h-2 w-2 animate-pulse rounded-full"
        style={{ background: collaborator.color }}
      />
    </div>
  );
}

/**
 * Ghost cursor overlay component for rendering on the canvas.
 */
export function GhostCursors({
  collaborators,
}: {
  collaborators: CollaboratorCursor[];
}) {
  if (collaborators.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-50 overflow-visible">
      {collaborators.map((cursor) => (
        <div
          key={cursor.id}
          className="absolute transition-all duration-75 ease-out"
          style={{
            left: cursor.position.x,
            top: cursor.position.y,
          }}
        >
          {/* Cursor arrow */}
          <svg width="24" height="24" viewBox="0 0 24 24" className="block">
            <path
              d="M5.65376 7.75121L12.6538 2.25121C13.0385 1.95158 13.6017 2.03605 13.8835 2.43912C14.1653 2.84219 14.0832 3.39833 13.6985 3.69796L9.53918 7.01465C10.7408 7.76521 11.5784 9.05693 11.5784 10.5208C11.5784 12.6808 9.78139 14.4287 7.58573 14.4287C5.38907 14.4287 3.59302 12.6808 3.59302 10.5208C3.59302 9.04987 4.43062 7.75815 5.65376 7.75121Z"
              fill={cursor.color}
              stroke="white"
              strokeWidth="1.5"
            />
          </svg>

          {/* Name label */}
          <div
            className="absolute left-5 top-5 max-w-[120px] rounded px-1.5 py-0.5 text-[10px] font-medium text-white truncate shadow-md whitespace-nowrap"
            style={{ background: cursor.color }}
          >
            {cursor.name}
          </div>
        </div>
      ))}
    </div>
  );
}

export function MultiplayerToggle({
  isActive,
  onClick,
  collaboratorCount,
  isConnected,
}: {
  isActive: boolean;
  onClick: () => void;
  collaboratorCount: number;
  isConnected: boolean;
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
      <Users className="h-3.5 w-3.5" />
      <span>Multiplayer</span>
      {collaboratorCount > 0 && (
        <span
          className={`flex h-5 items-center gap-1 rounded-full px-1.5 text-[10px] font-semibold ${
            isConnected ? "bg-green-500/20 text-green-500" : "text-muted-foreground bg-surface"
          }`}
        >
          {collaboratorCount}
        </span>
      )}
    </button>
  );
}

/**
 * Hook for managing multiplayer presence state with real project members.
 */
export function useMultiplayerPresence(
  canvasRef: React.RefObject<HTMLDivElement>,
  zoom: number,
  nodes: Array<{ id: string; label: string; x: number; y: number }>,
  projectId?: string | null,
  currentUserId?: string | null
) {
  const [presenceState, setPresenceState] = useState<PresenceState>(initializePresenceState);
  const animationRef = useRef<number | null>(null);

  // Load real members when project changes
  useEffect(() => {
    if (!projectId) return;
    loadProjectMembers(projectId, currentUserId).then((collaborators) => {
      setPresenceState((prev) => ({
        ...prev,
        collaborators,
        isConnected: true,
      }));
    });
  }, [projectId, currentUserId]);

  useEffect(() => {
    if (!presenceState.isConnected) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      return;
    }

    let lastTime = Date.now();

    const animate = () => {
      const now = Date.now();
      const elapsed = now - lastTime;

      if (elapsed > 50) {
        lastTime = now;

        setPresenceState((prev) => {
          if (!prev.isConnected) return prev;

          const canvasRect = canvasRef.current?.getBoundingClientRect();
          const canvasWidth = canvasRect?.width || 1200;
          const canvasHeight = canvasRect?.height || 800;

          return {
            ...prev,
            collaborators: prev.collaborators.map((cursor) =>
              updateCursorPosition(cursor, nodes, canvasWidth, canvasHeight, zoom / 100)
            ),
          };
        });
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [presenceState.isConnected, nodes, zoom, canvasRef]);

  const toggleConnection = useCallback(() => {
    setPresenceState((prev) => toggleConnection(prev));
  }, []);

  const addCollaborator = useCallback(() => {
    if (!projectId) return;
    loadProjectMembers(projectId, currentUserId).then((collaborators) => {
      setPresenceState((prev) => ({
        ...prev,
        collaborators: [...prev.collaborators, ...collaborators],
      }));
    });
  }, [projectId, currentUserId]);

  return {
    presenceState,
    toggleConnection,
    addCollaborator,
  };
}
