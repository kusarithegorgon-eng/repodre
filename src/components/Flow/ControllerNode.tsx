/**
 * ControllerNode — Intermediary Logic Node for App Journey Flow
 *
 * Controller nodes act as middleware between UI/View nodes and Database nodes.
 * They represent business logic, API endpoints, or data transformation layers.
 *
 * Visual indicators:
 *   - Distinct "controller" accent color (blue) for the logic layer
 *   - Cpu icon badge indicating logic layer
 *   - Special border/highlight to stand out
 *
 * Helper functions:
 *   - linkUiToController: manually connect a UI node to a Controller node
 *   - linkControllerToDatabase: manually connect a Controller node to a Database node
 *   - validateConnection: check if a connection violates the UI→Controller→Database rule
 *   - createControllerNode: factory for new Controller nodes with sensible defaults
 */

import { GitBranch, Cpu, ShieldAlert, Link2 } from "lucide-react";
import { NodeShapeSVG, type NodeType } from "@/components/NodeShapeSVG";
import type { Shape, PositionedNode, Point } from "@/lib/canvas-geometry";
import type { Accent } from "@/lib/db-client";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface ControllerNodeData extends PositionedNode {
  id: string;
  label: string;
  sub: string;
  shape: Shape;
  accent: Accent;
  x: number;
  y: number;
  workspace: "app" | "erd";
  /** Indicates this is a controller node */
  isController?: boolean;
  /** Connected UI/View nodes (upstream) */
  upstreamViews?: string[];
  /** Connected Database nodes (downstream) */
  downstreamDatabases?: string[];
}

interface ControllerNodeProps {
  node: ControllerNodeData;
  isSelected: boolean;
  onClick?: () => void;
  onDoubleClick?: () => void;
  children?: React.ReactNode;
}

export type ArchitecturalLayer = "view" | "controller" | "database" | "validation" | "other";

export interface FlowNode {
  id: string;
  label: string;
  sub: string;
  shape: string;
  accent: string;
  x: number;
  y: number;
  workspace: string;
}

export interface FlowEdge {
  id: string;
  from: string;
  to: string;
}

export interface ValidationResult {
  allowed: boolean;
  warning?: string;
  severity?: "info" | "warning" | "error";
  suggestion?: string;
}

// ─── Controller Node Component ─────────────────────────────────────────────

/**
 * ControllerNode component renders a node with controller-specific styling.
 * Uses blue accent color to visually identify it as the "logic" layer.
 */
export function ControllerNode({
  node,
  isSelected,
  onClick,
  onDoubleClick,
  children,
}: ControllerNodeProps) {
  const width = node.w ?? 240;
  const height = node.h ?? 100;
  const nodeType: NodeType = "controller";

  return (
    <div
      className={`absolute cursor-pointer transition-shadow duration-150 ${
        isSelected ? "z-30" : "z-10"
      }`}
      style={{
        left: node.x,
        top: node.y,
        width,
        height,
      }}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    >
      {/* Controller badge - top right */}
      <div className="absolute -right-1 -top-2 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-blue-500 text-white shadow-sm">
        <Cpu className="h-3 w-3" />
      </div>

      {/* Node shape */}
      <NodeShapeSVG
        shape={node.shape}
        width={width}
        height={height}
        color="var(--node-controller-stroke)"
        glow="transparent"
        selected={isSelected}
        nodeType={nodeType}
      />

      {/* Content */}
      {children}
    </div>
  );
}

// ─── Higher-Order Component ────────────────────────────────────────────────

/**
 * Higher-order component that wraps any node with controller badge styling.
 * Use this to dynamically mark nodes as controllers without changing their shape.
 */
export function withControllerBadge<P extends object>(
  Component: React.ComponentType<P>
): React.FC<P & { showControllerBadge?: boolean }> {
  return function WithControllerBadge({ showControllerBadge = true, ...props }) {
    if (!showControllerBadge) {
      return <Component {...(props as P)} />;
    }

    return (
      <div className="relative">
        {/* Controller indicator badge */}
        <div className="absolute -right-1 -top-2 z-20 flex h-5 items-center gap-1 rounded-full bg-blue-500 px-1.5 text-[9px] font-semibold text-white shadow-sm">
          <GitBranch className="h-2.5 w-2.5" />
          <span>LOGIC</span>
        </div>
        <Component {...(props as P)} />
      </div>
    );
  };
}

// ─── Standalone Badge ───────────────────────────────────────────────────────

/**
 * Controller badge component for standalone use.
 * Can be positioned relative to any node.
 */
export function ControllerBadge({ className = "" }: { className?: string }) {
  return (
    <div
      className={`flex h-5 items-center gap-1 rounded-full bg-blue-500 px-1.5 text-[9px] font-semibold text-white shadow-sm ${className}`}
    >
      <Cpu className="h-2.5 w-2.5" />
      <span>LOGIC</span>
    </div>
  );
}

// ─── Classification Helpers ─────────────────────────────────────────────────

/**
 * Determines if a node should be treated as a controller based on its properties.
 */
export function isControllerNode(
  node: { label: string; sub: string; shape: string; accent: string }
): boolean {
  if (node.accent === "teal" || node.accent === "blue") return true;

  const label = node.label.toLowerCase();
  if (label.includes("/api/") || label.includes("controller")) return true;
  if (label.includes("handler") || label.includes("service")) return true;

  const sub = node.sub.toLowerCase();
  if (sub.includes("controller") || sub.includes("endpoint")) return true;
  if (sub.includes("handler") || sub.includes("service")) return true;

  return false;
}

/**
 * Classifies nodes by their architectural layer.
 */
export function classifyNodeLayer(node: {
  label: string;
  sub: string;
  shape: string;
  accent: string;
}): ArchitecturalLayer {
  const label = node.label.toLowerCase();
  const sub = node.sub.toLowerCase();

  // Database layer (cylinder shapes, blue accent)
  if (node.shape === "cylinder" || node.accent === "blue") {
    return "database";
  }

  // View/UI layer (pill shapes, green accent)
  if (node.shape === "pill" || node.accent === "green") {
    return "view";
  }

  // Validation layer (diamond shapes, purple accent)
  if (node.shape === "diamond" || node.accent === "purple") {
    return "validation";
  }

  // Controller layer (rectangle, teal accent, API paths)
  if (isControllerNode(node)) {
    return "controller";
  }

  return "other";
}

// ─── Controller Node Factory ────────────────────────────────────────────────

/**
 * Factory function to create a new Controller node with sensible defaults.
 * Uses blue accent and rectangle shape to visually distinguish it as the logic layer.
 */
export function createControllerNode(params: {
  id: string;
  label: string;
  sub?: string;
  x: number;
  y: number;
  workspace?: "app" | "erd";
}): ControllerNodeData {
  return {
    id: params.id,
    label: params.label,
    sub: params.sub ?? "Controller · Logic Layer",
    shape: "rectangle",
    accent: "teal",
    x: params.x,
    y: params.y,
    workspace: params.workspace ?? "app",
    isController: true,
    upstreamViews: [],
    downstreamDatabases: [],
  };
}

// ─── Manual Link Helpers ────────────────────────────────────────────────────

/**
 * Manually link a UI/View node to a Controller node.
 * Returns a new edge object representing the UI → Controller connection.
 */
export function linkUiToController(
  uiNode: FlowNode,
  controllerNode: FlowNode,
  edgeId?: string
): FlowEdge {
  return {
    id: edgeId ?? `link_ui_ctrl_${uiNode.id}_${controllerNode.id}`,
    from: uiNode.id,
    to: controllerNode.id,
  };
}

/**
 * Manually link a Controller node to a Database node.
 * Returns a new edge object representing the Controller → Database connection.
 */
export function linkControllerToDatabase(
  controllerNode: FlowNode,
  dbNode: FlowNode,
  edgeId?: string
): FlowEdge {
  return {
    id: edgeId ?? `link_ctrl_db_${controllerNode.id}_${dbNode.id}`,
    from: controllerNode.id,
    to: dbNode.id,
  };
}

/**
 * Convenience: link a UI node to a Database node through a Controller,
 * returning both edges. If no controller is provided, a new one is
 * generated at the midpoint between the UI and Database nodes.
 */
export function linkUiThroughControllerToDatabase(params: {
  uiNode: FlowNode;
  dbNode: FlowNode;
  controllerNode?: FlowNode;
  controllerId?: string;
}): {
  controller: FlowNode;
  edges: FlowEdge[];
} {
  const { uiNode, dbNode } = params;

  let controller = params.controllerNode;
  if (!controller) {
    const midX = (uiNode.x + dbNode.x) / 2;
    const midY = (uiNode.y + dbNode.y) / 2;
    const ctrlId = params.controllerId ?? `controller_${uiNode.id}_${dbNode.id}`;
    controller = {
      id: ctrlId,
      label: `/api/${dbNode.label.toLowerCase().replace(/[^a-z0-9]/g, "")}`,
      sub: "Controller · Logic Layer",
      shape: "rectangle",
      accent: "teal",
      x: midX,
      y: midY,
      workspace: uiNode.workspace,
    };
  }

  const edges: FlowEdge[] = [
    linkUiToController(uiNode, controller),
    linkControllerToDatabase(controller, dbNode),
  ];

  return { controller, edges };
}

// ─── Anti-Pattern Validation Rule ───────────────────────────────────────────

/**
 * Validates a proposed connection between two nodes.
 * If a user tries to link a UI node directly to a Database node,
 * this returns a security warning suggesting a Controller intermediary.
 */
export function validateConnection(
  fromNode: FlowNode,
  toNode: FlowNode,
  existingEdges: FlowEdge[] = [],
  allNodes: FlowNode[] = []
): ValidationResult {
  const fromLayer = classifyNodeLayer(fromNode);
  const toLayer = classifyNodeLayer(toNode);

  // Anti-pattern: UI → Database direct connection
  if (fromLayer === "view" && toLayer === "database") {
    return {
      allowed: false,
      warning: "Security Warning: Direct UI-to-Database connection detected. This bypasses the Controller layer and violates separation of concerns.",
      severity: "error",
      suggestion: "Add a Controller node between the UI and Database nodes to handle business logic, validation, and data access.",
    };
  }

  // Anti-pattern: Database → UI direct connection (reverse direction)
  if (fromLayer === "database" && toLayer === "view") {
    return {
      allowed: false,
      warning: "Security Warning: Database-to-UI direct connection detected. Data should flow through a Controller, not directly to the view layer.",
      severity: "error",
      suggestion: "Route the connection through a Controller node to maintain proper architectural layering.",
    };
  }

  // Warn on UI → UI connections (unusual but not blocked)
  if (fromLayer === "view" && toLayer === "view") {
    return {
      allowed: true,
      warning: "Info: Linking two UI nodes directly. Consider if a Controller intermediary is needed for data flow.",
      severity: "info",
    };
  }

  // Valid: UI → Controller
  if (fromLayer === "view" && toLayer === "controller") {
    return { allowed: true };
  }

  // Valid: Controller → Database
  if (fromLayer === "controller" && toLayer === "database") {
    return { allowed: true };
  }

  // Valid: UI → Validation
  if (fromLayer === "view" && toLayer === "validation") {
    return { allowed: true };
  }

  // Valid: Validation → Controller
  if (fromLayer === "validation" && toLayer === "controller") {
    return { allowed: true };
  }

  // Default: allow
  return { allowed: true };
}

/**
 * Scans all existing edges for anti-patterns and returns warnings
 * for any direct UI-to-Database connections.
 */
export function findAntiPatternWarnings(
  nodes: FlowNode[],
  edges: FlowEdge[]
): Array<{
  edgeId: string;
  fromNodeId: string;
  toNodeId: string;
  warning: string;
  suggestion: string;
}> {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const warnings: Array<{
    edgeId: string;
    fromNodeId: string;
    toNodeId: string;
    warning: string;
    suggestion: string;
  }> = [];

  for (const edge of edges) {
    const fromNode = nodeMap.get(edge.from);
    const toNode = nodeMap.get(edge.to);
    if (!fromNode || !toNode) continue;

    const result = validateConnection(fromNode, toNode, edges, nodes);
    if (!result.allowed && result.warning) {
      warnings.push({
        edgeId: edge.id,
        fromNodeId: edge.from,
        toNodeId: edge.to,
        warning: result.warning,
        suggestion: result.suggestion ?? "",
      });
    }
  }

  return warnings;
}

// ─── Security Warning Badge ─────────────────────────────────────────────────

/**
 * SecurityWarningBadge — displays a warning when a user attempts
 * to create a direct UI-to-Database connection.
 */
export function SecurityWarningBadge({
  message,
  suggestion,
  onDismiss,
}: {
  message: string;
  suggestion?: string;
  onDismiss?: () => void;
}) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 shadow-lg">
      <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
      <div className="flex-1">
        <p className="text-xs font-semibold text-red-500">{message}</p>
        {suggestion && (
          <p className="mt-1 text-[11px] text-muted-foreground">{suggestion}</p>
        )}
      </div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="flex h-5 w-5 items-center justify-center rounded-md text-muted-foreground hover:bg-red-500/10 hover:text-red-500"
        >
          ×
        </button>
      )}
    </div>
  );
}

// ─── Link Button Component ──────────────────────────────────────────────────

/**
 * LinkButton — a button that appears on node hover to manually
 * create a connection between nodes.
 */
export function LinkButton({
  onClick,
  label = "Link",
  className = "",
}: {
  onClick: () => void;
  label?: string;
  className?: string;
}) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`flex h-7 w-7 items-center justify-center rounded-full border-2 border-blue-500 bg-background text-blue-500 opacity-0 shadow-md transition-all duration-200 hover:bg-blue-500 hover:text-white group-hover:opacity-100 ${className}`}
      title={label}
    >
      <Link2 className="h-3.5 w-3.5" />
    </button>
  );
}

export default ControllerNode;
