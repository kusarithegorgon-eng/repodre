/**
 * TimeTravelTracer — Deterministic State Machine Time-Travel
 *
 * A playback control toolbar at the bottom of the canvas that treats
 * the active canvas nodes as distinct states in a finite state machine.
 * Step-forward inputs trigger active state animations, lighting up
 * connection edges and layout paths sequentially.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { SkipBack, SkipForward, Play, Pause, RotateCcw, FastForward, Clock } from "lucide-react";

interface TracerNode {
  id: string;
  label: string;
  type: string;
}

interface TracerEdge {
  id: string;
  from: string;
  to: string;
}

interface TimeTravelTracerProps {
  nodes: TracerNode[];
  edges: TracerEdge[];
  onHighlightNode: (id: string | null) => void;
  onHighlightEdges: (ids: string[]) => void;
}

interface ExecutionStep {
  nodeId: string;
  edgeIds: string[];
  label: string;
}

export function TimeTravelTracer({
  nodes,
  edges,
  onHighlightNode,
  onHighlightEdges,
}: TimeTravelTracerProps) {
  const [isActive, setIsActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Build execution path from the graph (BFS from entry nodes)
  const executionPath = buildExecutionPath(nodes, edges);

  // Auto-play
  useEffect(() => {
    if (!isPlaying) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    intervalRef.current = setInterval(() => {
      setCurrentStep((prev) => {
        const next = prev + 1;
        if (next >= executionPath.length) {
          setIsPlaying(false);
          return prev;
        }
        return next;
      });
    }, 1000 / speed);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isPlaying, speed, executionPath.length]);

  // Update highlights when step changes
  useEffect(() => {
    if (currentStep < 0 || currentStep >= executionPath.length) {
      onHighlightNode(null);
      onHighlightEdges([]);
      return;
    }

    const step = executionPath[currentStep];
    onHighlightNode(step.nodeId);

    // Highlight all edges up to and including current step
    const allEdgeIds = executionPath
      .slice(0, currentStep + 1)
      .flatMap((s) => s.edgeIds);
    onHighlightEdges(allEdgeIds);
  }, [currentStep, executionPath, onHighlightNode, onHighlightEdges]);

  const handleStepForward = useCallback(() => {
    setIsPlaying(false);
    setCurrentStep((prev) => Math.min(prev + 1, executionPath.length - 1));
  }, [executionPath.length]);

  const handleStepBackward = useCallback(() => {
    setIsPlaying(false);
    setCurrentStep((prev) => Math.max(prev - 1, -1));
  }, []);

  const handleRewind = useCallback(() => {
    setIsPlaying(false);
    setCurrentStep(-1);
  }, []);

  const handleReset = useCallback(() => {
    setIsPlaying(false);
    setCurrentStep(-1);
    onHighlightNode(null);
    onHighlightEdges([]);
  }, [onHighlightNode, onHighlightEdges]);

  const handlePlayPause = useCallback(() => {
    if (currentStep >= executionPath.length - 1) {
      setCurrentStep(-1);
    }
    setIsPlaying((prev) => !prev);
  }, [currentStep, executionPath.length]);

  const handleSkipToEnd = useCallback(() => {
    setIsPlaying(false);
    setCurrentStep(executionPath.length - 1);
  }, [executionPath.length]);

  if (!isActive) {
    return (
      <button
        onClick={() => setIsActive(true)}
        className="flex h-9 items-center gap-2 rounded-lg border border-border bg-background px-3 text-xs font-medium text-muted-foreground transition-all hover:border-teal hover:text-teal"
        title="Time-Travel Tracer"
      >
        <Clock className="h-3.5 w-3.5" />
        Time-Travel
      </button>
    );
  }

  const currentStepData = currentStep >= 0 && currentStep < executionPath.length
    ? executionPath[currentStep]
    : null;

  return (
    <div className="absolute bottom-4 left-1/2 z-30 -translate-x-1/2 rounded-xl border border-border bg-popover/95 p-3 shadow-2xl backdrop-blur">
      <div className="flex items-center gap-3">
        {/* Title */}
        <div className="flex items-center gap-2 border-r border-border pr-3">
          <Clock className="h-4 w-4 text-teal" />
          <div>
            <p className="text-xs font-semibold text-foreground">Time-Travel Tracer</p>
            <p className="text-[10px] text-muted-foreground">
              {currentStep + 1} / {executionPath.length} states
            </p>
          </div>
        </div>

        {/* Playback controls */}
        <div className="flex items-center gap-1">
          <button
            onClick={handleRewind}
            title="Rewind to start"
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <SkipBack className="h-4 w-4" />
          </button>
          <button
            onClick={handleStepBackward}
            title="Step backward"
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <SkipForward className="h-4 w-4 rotate-180" />
          </button>
          <button
            onClick={handlePlayPause}
            title={isPlaying ? "Pause" : "Play"}
            className="flex h-9 w-9 items-center justify-center rounded-md bg-teal text-white transition-colors hover:bg-teal/90"
          >
            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>
          <button
            onClick={handleStepForward}
            title="Step forward"
            disabled={currentStep >= executionPath.length - 1}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
          >
            <SkipForward className="h-4 w-4" />
          </button>
          <button
            onClick={handleSkipToEnd}
            title="Skip to end"
            disabled={currentStep >= executionPath.length - 1}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
          >
            <FastForward className="h-4 w-4" />
          </button>
          <button
            onClick={handleReset}
            title="Reset"
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        </div>

        {/* Speed control */}
        <div className="flex items-center gap-1.5 border-l border-border pl-3">
          <span className="text-[10px] text-muted-foreground">Speed</span>
          <div className="flex items-center gap-0.5">
            {[0.5, 1, 2, 4].map((s) => (
              <button
                key={s}
                onClick={() => setSpeed(s)}
                className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                  speed === s
                    ? "bg-teal/20 text-teal"
                    : "text-muted-foreground hover:bg-accent"
                }`}
              >
                {s}x
              </button>
            ))}
          </div>
        </div>

        {/* Current state */}
        {currentStepData && (
          <div className="border-l border-border pl-3">
            <p className="text-[10px] text-muted-foreground">Current State</p>
            <p className="font-mono text-xs text-foreground">{currentStepData.label}</p>
          </div>
        )}

        {/* Close */}
        <button
          onClick={() => {
            setIsActive(false);
            handleReset();
          }}
          className="ml-2 flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          ×
        </button>
      </div>

      {/* Progress bar */}
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface">
        <div
          className="h-full bg-teal transition-all duration-300"
          style={{
            width: `${executionPath.length > 0 ? ((currentStep + 1) / executionPath.length) * 100 : 0}%`,
          }}
        />
      </div>
    </div>
  );
}

/**
 * Build an execution path through the graph using BFS from entry nodes.
 * Entry nodes are nodes with no incoming edges (or view-type nodes).
 */
function buildExecutionPath(nodes: TracerNode[], edges: TracerEdge[]): ExecutionStep[] {
  if (nodes.length === 0) return [];

  // Find entry nodes (no incoming edges, or view type)
  const incomingCount = new Map<string, number>();
  for (const node of nodes) incomingCount.set(node.id, 0);
  for (const edge of edges) {
    incomingCount.set(edge.to, (incomingCount.get(edge.to) || 0) + 1);
  }

  const entryNodes = nodes.filter((n) => {
    const count = incomingCount.get(n.id) || 0;
    return count === 0 || n.type === "view";
  });

  // If no clear entry nodes, use the first node
  const startNodes = entryNodes.length > 0 ? entryNodes : [nodes[0]];

  const visited = new Set<string>();
  const path: ExecutionStep[] = [];
  const queue: string[] = startNodes.map((n) => n.id);

  // Track which edges connect to each node
  const edgesFromNode = new Map<string, TracerEdge[]>();
  for (const edge of edges) {
    const list = edgesFromNode.get(edge.from) || [];
    list.push(edge);
    edgesFromNode.set(edge.from, list);
  }

  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    if (visited.has(nodeId)) continue;
    visited.add(nodeId);

    const node = nodes.find((n) => n.id === nodeId);
    if (!node) continue;

    // Find edges from this node
    const outgoingEdges = edgesFromNode.get(nodeId) || [];
    const edgeIds = outgoingEdges.map((e) => e.id);

    path.push({
      nodeId,
      edgeIds,
      label: node.label,
    });

    // Add children to queue
    for (const edge of outgoingEdges) {
      if (!visited.has(edge.to)) {
        queue.push(edge.to);
      }
    }
  }

  // Add any unvisited nodes at the end
  for (const node of nodes) {
    if (!visited.has(node.id)) {
      path.push({
        nodeId: node.id,
        edgeIds: [],
        label: node.label,
      });
    }
  }

  return path;
}
