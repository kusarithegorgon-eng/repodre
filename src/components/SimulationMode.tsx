/**
 * SimulationMode — Interactive Pathway Execution Simulator
 *
 * A simulation mode that dims the workspace and highlights execution flow
 * when activated. Shows a side drawer with execution inputs and dynamically
 * lights up SVG connection wires as the user clicks through steps.
 */

import { useState, useCallback, useEffect, useMemo } from "react";
import { Play, Pause, SkipForward, RotateCcw, Zap, X, ChevronRight } from "lucide-react";

export interface SimulationNode {
  id: string;
  type: "view" | "validation" | "controller" | "database" | "error";
  label: string;
}

export interface SimulationEdge {
  id: string;
  from: string;
  to: string;
  label?: string;
}

export interface SimulationStep {
  nodeId: string;
  edgeIds: string[];
  label: string;
  description: string;
}

interface SimulationModeProps {
  isOpen: boolean;
  onClose: () => void;
  nodes: SimulationNode[];
  edges: SimulationEdge[];
  onHighlightNode: (id: string | null) => void;
  onHighlightEdges: (ids: string[]) => void;
}

export function SimulationMode({
  isOpen,
  onClose,
  nodes,
  edges,
  onHighlightNode,
  onHighlightEdges,
}: SimulationModeProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  // Build simulation path: find the entry view "/" and trace through
  const simulationPath = useMemo(() => {
    const entryNode = nodes.find(
      (n) => n.type === "view" && (n.label === "/" || n.label.includes("Landing"))
    );
    if (!entryNode) return [];

    const steps: SimulationStep[] = [];
    const visited = new Set<string>();
    const queue: string[] = [entryNode.id];

    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      if (visited.has(nodeId)) continue;
      visited.add(nodeId);

      const node = nodes.find((n) => n.id === nodeId);
      if (!node) continue;

      // Find outgoing edges from this node
      const outEdges = edges.filter((e) => e.from === nodeId);

      const step: SimulationStep = {
        nodeId,
        edgeIds: outEdges.map((e) => e.id),
        label: node.label,
        description: getStepDescription(node, outEdges),
      };
      steps.push(step);

      // Add connected nodes to queue
      for (const edge of outEdges) {
        if (!visited.has(edge.to)) {
          queue.push(edge.to);
        }
      }
    }

    return steps;
  }, [nodes, edges]);

  // Auto-play simulation
  useEffect(() => {
    if (!isPlaying || !isOpen) return;

    const timer = setInterval(() => {
      setCurrentStep((prev) => {
        const next = prev + 1;
        if (next >= simulationPath.length) {
          setIsPlaying(false);
          return prev;
        }
        return next;
      });
    }, 2000);

    return () => clearInterval(timer);
  }, [isPlaying, isOpen, simulationPath.length]);

  // Highlight current step
  useEffect(() => {
    if (!isOpen || simulationPath.length === 0) {
      onHighlightNode(null);
      onHighlightEdges([]);
      return;
    }

    const step = simulationPath[currentStep];
    if (step) {
      onHighlightNode(step.nodeId);
      onHighlightEdges(step.edgeIds);
    }
  }, [isOpen, currentStep, simulationPath, onHighlightNode, onHighlightEdges]);

  const handleNext = useCallback(() => {
    setCurrentStep((prev) => Math.min(prev + 1, simulationPath.length - 1));
  }, [simulationPath.length]);

  const handlePrev = useCallback(() => {
    setCurrentStep((prev) => Math.max(prev - 1, 0));
  }, []);

  const handleReset = useCallback(() => {
    setCurrentStep(0);
    setIsPlaying(false);
  }, []);

  if (!isOpen) return null;

  const currentStepData = simulationPath[currentStep];

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-80 flex-col bg-popover border-l border-border shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-teal" />
          <span className="text-sm font-semibold text-foreground">Simulation Mode</span>
        </div>
        <button
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent transition-colors"
        >
          <X className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>

      {/* Progress */}
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
          <span>Step {currentStep + 1} of {simulationPath.length}</span>
          <span>{Math.round(((currentStep + 1) / simulationPath.length) * 100)}%</span>
        </div>
        <div className="h-2 bg-surface rounded-full overflow-hidden">
          <div
            className="h-full bg-teal transition-all duration-300"
            style={{ width: `${((currentStep + 1) / simulationPath.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Current step info */}
      <div className="flex-1 overflow-auto p-4">
        {currentStepData ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-teal bg-teal/10 p-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-teal">
                  Current Node
                </span>
              </div>
              <p className="font-mono text-sm font-semibold text-foreground">
                {currentStepData.label}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {currentStepData.description}
              </p>
            </div>

            {/* Outgoing connections */}
            {currentStepData.edgeIds.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Next Steps
                </p>
                <div className="space-y-1">
                  {currentStepData.edgeIds.map((edgeId) => {
                    const edge = edges.find((e) => e.id === edgeId);
                    const targetNode = nodes.find((n) => n.id === edge?.to);
                    return targetNode ? (
                      <div
                        key={edgeId}
                        className="flex items-center gap-2 text-xs text-muted-foreground"
                      >
                        <ChevronRight className="h-3 w-3" />
                        <span className="font-mono">{targetNode.label}</span>
                        {edge?.label && (
                          <span className="text-[10px] text-teal">({edge.label})</span>
                        )}
                      </div>
                    ) : null;
                  })}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Play className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <p className="text-sm text-muted-foreground">
              No simulation path found
            </p>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-2 border-t border-border p-4">
        <button
          onClick={handleReset}
          title="Reset"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-border hover:bg-accent transition-colors"
        >
          <RotateCcw className="h-4 w-4" />
        </button>
        <button
          onClick={() => setIsPlaying(!isPlaying)}
          title={isPlaying ? "Pause" : "Play"}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-teal text-white hover:bg-teal/90 transition-colors"
        >
          {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </button>
        <button
          onClick={handleNext}
          disabled={currentStep >= simulationPath.length - 1}
          title="Next step"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-border hover:bg-accent transition-colors disabled:opacity-40"
        >
          <SkipForward className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function getStepDescription(
  node: SimulationNode,
  outEdges: SimulationEdge[]
): string {
  switch (node.type) {
    case "view":
      return "User-facing route — entry point to the application";
    case "validation":
      return `Validation checkpoint with ${outEdges.length} outcome${outEdges.length > 1 ? "s" : ""}`;
    case "controller":
      return "Backend API route processing the request";
    case "database":
      return "Database table — persistent storage layer";
    case "error":
      return "Error handler — validation failure branch";
    default:
      return "Processing step in the execution flow";
  }
}

export function SimulationModeToggle({
  isActive,
  onClick,
}: {
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title="Toggle simulation mode"
      className={`flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-medium transition-all ${
        isActive
          ? "border-teal bg-teal/10 text-teal"
          : "border-border bg-background text-muted-foreground hover:border-teal hover:text-teal"
      }`}
    >
      <Zap className="h-3.5 w-3.5" />
      Simulate
    </button>
  );
}
