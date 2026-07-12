/**
 * NodeSpawnerPopover — Floating Node Creator
 *
 * Triggered by right-click or hotkey (A) on the canvas workspace.
 * Renders a compact popover menu directly under the cursor with
 * options to create: Page View, Validation, API Route, DB Table.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { FileText, Shield, Server, Database, X, GitBranch, Play, RotateCcw, FileCode } from "lucide-react";
import type { Shape } from "@/lib/canvas-geometry";

export type NodeSpawnerType = "view" | "validation" | "controller" | "database" | "decision" | "start" | "end" | "document";

export interface NodeSpawnerOption {
  type: NodeSpawnerType;
  label: string;
  icon: React.ReactNode;
  shape: Shape;
  accent: "green" | "purple" | "teal" | "blue" | "orange" | "red";
  shortcut?: string;
  description: string;
}

export const SPAWNER_OPTIONS: NodeSpawnerOption[] = [
  {
    type: "view",
    label: "Page View",
    icon: <FileText className="h-4 w-4" />,
    shape: "pill",
    accent: "green",
    shortcut: "1",
    description: "User-facing route or page",
  },
  {
    type: "validation",
    label: "Validation",
    icon: <Shield className="h-4 w-4" />,
    shape: "diamond",
    accent: "purple",
    shortcut: "2",
    description: "Form validation or guard",
  },
  {
    type: "controller",
    label: "API Route",
    icon: <Server className="h-4 w-4" />,
    shape: "rectangle",
    accent: "teal",
    shortcut: "3",
    description: "Backend API controller",
  },
  {
    type: "database",
    label: "DB Table",
    icon: <Database className="h-4 w-4" />,
    shape: "cylinder",
    accent: "blue",
    shortcut: "4",
    description: "Database table entity",
  },
  {
    type: "decision",
    label: "Decision",
    icon: <GitBranch className="h-4 w-4" />,
    shape: "diamond",
    accent: "orange",
    shortcut: "5",
    description: "User decision branch point",
  },
  {
    type: "start",
    label: "Start",
    icon: <Play className="h-4 w-4" />,
    shape: "pill",
    accent: "green",
    shortcut: "6",
    description: "Journey entry point",
  },
  {
    type: "end",
    label: "End / Loop",
    icon: <RotateCcw className="h-4 w-4" />,
    shape: "pill",
    accent: "red",
    shortcut: "7",
    description: "Terminal or loop-back node",
  },
  {
    type: "document",
    label: "Document",
    icon: <FileCode className="h-4 w-4" />,
    shape: "document",
    accent: "teal",
    shortcut: "8",
    description: "Document or file artifact",
  },
];

export interface NodeSpawnerPopoverProps {
  isOpen: boolean;
  position: { x: number; y: number };
  onSelect: (type: NodeSpawnerType, position: { x: number; y: number }) => void;
  onClose: () => void;
}

export function NodeSpawnerPopover({
  isOpen,
  position,
  onSelect,
  onClose,
}: NodeSpawnerPopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Handle keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev > 0 ? prev - 1 : SPAWNER_OPTIONS.length - 1
          );
          break;
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev < SPAWNER_OPTIONS.length - 1 ? prev + 1 : 0
          );
          break;
        case "Enter":
          e.preventDefault();
          const option = SPAWNER_OPTIONS[selectedIndex];
          onSelect(option.type, position);
          break;
        case "Escape":
          e.preventDefault();
          onClose();
          break;
        case "1":
        case "2":
        case "3":
        case "4":
          e.preventDefault();
          const idx = parseInt(e.key) - 1;
          if (SPAWNER_OPTIONS[idx]) {
            onSelect(SPAWNER_OPTIONS[idx].type, position);
          }
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, selectedIndex, position, onSelect, onClose]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };

    // Delay to allow the mousedown that opened it to complete
    const timer = setTimeout(() => {
      window.addEventListener("mousedown", handleClickOutside);
    }, 10);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      ref={ref}
      className="node-spawner-popover animate-fade-in"
      style={{
        position: "fixed",
        left: position.x,
        top: position.y,
        zIndex: 1000,
        transform: "translate(-50%, 12px)",
      }}
    >
      <div className="w-56 rounded-xl border border-border bg-popover shadow-2xl backdrop-blur overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-surface/50">
          <span className="text-xs font-semibold text-muted-foreground">
            Add Node
          </span>
          <button
        data-tip="Close node spawner"
            onClick={onClose}
            className="flex h-5 w-5 items-center justify-center rounded hover:bg-accent"
          >
            <X className="h-3 w-3 text-muted-foreground" />
          </button>
        </div>

        {/* Options */}
        <div className="py-1">
          {SPAWNER_OPTIONS.map((option, idx) => (
            <button
              key={option.type}
              onClick={() => onSelect(option.type, position)}
              onMouseEnter={() => setSelectedIndex(idx)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                idx === selectedIndex
                  ? "bg-teal/10 border-l-2 border-teal"
                  : "hover:bg-accent border-l-2 border-transparent"
              }`}
            >
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                  option.accent === "green"
                    ? "bg-neon-green/15 text-neon-green"
                    : option.accent === "purple"
                    ? "bg-neon-purple/15 text-neon-purple"
                    : option.accent === "teal"
                    ? "bg-teal/15 text-teal"
                    : "bg-neon-blue/15 text-neon-blue"
                }`}
              >
                {option.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">
                    {option.label}
                  </span>
                  {option.shortcut && (
                    <span className="px-1.5 py-0.5 rounded bg-muted text-[10px] text-muted-foreground">
                      {option.shortcut}
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {option.description}
                </span>
              </div>
            </button>
          ))}
        </div>

        {/* Footer hint */}
        <div className="px-3 py-2 border-t border-border bg-surface/30">
          <p className="text-[10px] text-muted-foreground text-center">
            Press <kbd className="px-1 rounded bg-muted">A</kbd> to open •{" "}
            <kbd className="px-1 rounded bg-muted">1-4</kbd> to select
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Hook: Node Spawner Logic ─────────────────────────────────────────────────

export interface UseNodeSpawnerOptions {
  canvasRef: React.RefObject<HTMLDivElement>;
  zoom: number;
  onSpawnNode: (type: NodeSpawnerType, position: { x: number; y: number }) => void;
}

export interface NodeSpawnerState {
  isOpen: boolean;
  position: { x: number; y: number };
  canvasPosition: { x: number; y: number };
}

export function useNodeSpawner({
  canvasRef,
  zoom,
  onSpawnNode,
}: UseNodeSpawnerOptions) {
  const [state, setState] = useState<NodeSpawnerState>({
    isOpen: false,
    position: { x: 0, y: 0 },
    canvasPosition: { x: 0, y: 0 },
  });

  const openSpawner = useCallback(
    (clientX: number, clientY: number) => {
      if (!canvasRef.current) return;

      const rect = canvasRef.current.getBoundingClientRect();
      const canvasX = (clientX - rect.left) / zoom;
      const canvasY = (clientY - rect.top) / zoom;

      setState({
        isOpen: true,
        position: { x: clientX, y: clientY },
        canvasPosition: { x: canvasX, y: canvasY },
      });
    },
    [canvasRef, zoom]
  );

  const closeSpawner = useCallback(() => {
    setState((prev) => ({ ...prev, isOpen: false }));
  }, []);

  const handleSelect = useCallback(
    (type: NodeSpawnerType, _position: { x: number; y: number }) => {
      onSpawnNode(type, state.canvasPosition);
      closeSpawner();
    },
    [onSpawnNode, state.canvasPosition, closeSpawner]
  );

  // Listen for right-click and 'A' hotkey
  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      if (!canvasRef.current) return;

      // Only handle if click is inside canvas
      const rect = canvasRef.current.getBoundingClientRect();
      if (
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom
      ) {
        e.preventDefault();
        openSpawner(e.clientX, e.clientY);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if there's an active input
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA"
      ) {
        return;
      }

      if (e.key === "a" || e.key === "A") {
        e.preventDefault();
        // Spawn at center of canvas
        if (canvasRef.current) {
          const rect = canvasRef.current.getBoundingClientRect();
          const centerX = rect.left + rect.width / 2;
          const centerY = rect.top + rect.height / 2;
          openSpawner(centerX, centerY);
        }
      }
    };

    document.addEventListener("contextmenu", handleContextMenu);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("contextmenu", handleContextMenu);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [canvasRef, openSpawner]);

  return {
    ...state,
    openSpawner,
    closeSpawner,
    handleSelect,
  };
}

// ─── Node Factory Helper ───────────────────────────────────────────────────────

export interface NewNodeConfig {
  type: NodeSpawnerType;
  label: string;
  sub: string;
  shape: Shape;
  accent: "green" | "purple" | "teal" | "blue";
  x: number;
  y: number;
}

export function createNewNodeConfig(
  type: NodeSpawnerType,
  position: { x: number; y: number }
): NewNodeConfig {
  const option = SPAWNER_OPTIONS.find((o) => o.type === type)!;

  const defaultLabels: Record<NodeSpawnerType, string> = {
    view: "/new-route",
    validation: "validateInput()",
    controller: "/api/endpoint",
    database: "table_name",
    decision: "User Decision",
    start: "Start",
    end: "Loop",
    document: "Document",
  };

  const defaultSubs: Record<NodeSpawnerType, string> = {
    view: "View",
    validation: "Validation",
    controller: "Controller",
    database: "Table",
    decision: "Decision",
    start: "Start",
    end: "Loop",
    document: "Document",
  };

  return {
    type,
    label: defaultLabels[type],
    sub: defaultSubs[type],
    shape: option.shape,
    accent: option.accent,
    x: position.x,
    y: position.y,
  };
}
