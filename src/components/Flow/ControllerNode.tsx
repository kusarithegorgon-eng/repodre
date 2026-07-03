/**
 * ControllerNode — Intermediary Logic Node for App Journey Flow
 *
 * Controller nodes act as middleware between UI/View nodes and Database nodes.
 * They represent business logic, API endpoints, or data transformation layers.
 *
 * Visual indicators:
 *   - Distinct "controller" accent color (teal)
 *   - GitBranch icon badge indicating logic layer
 *   - Special border/highlight to stand out
 */

import { GitBranch, Cpu } from "lucide-react";
import { NodeShapeSVG, type NodeType } from "@/components/NodeShapeSVG";
import type { Shape, PositionedNode, Point } from "@/lib/canvas-geometry";
import type { Accent } from "@/lib/db-client";

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

/**
 * ControllerNode component renders a node with controller-specific styling.
 * Includes a logic badge and visual distinction from regular nodes.
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
      <div className="absolute -right-1 -top-2 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-teal text-white shadow-sm">
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
        <div className="absolute -right-1 -top-2 z-20 flex h-5 items-center gap-1 rounded-full bg-teal px-1.5 text-[9px] font-semibold text-white shadow-sm">
          <GitBranch className="h-2.5 w-2.5" />
          <span>LOGIC</span>
        </div>
        <Component {...(props as P)} />
      </div>
    );
  };
}

/**
 * Controller badge component for standalone use.
 * Can be positioned relative to any node.
 */
export function ControllerBadge({ className = "" }: { className?: string }) {
  return (
    <div
      className={`flex h-5 items-center gap-1 rounded-full bg-teal px-1.5 text-[9px] font-semibold text-white shadow-sm ${className}`}
    >
      <Cpu className="h-2.5 w-2.5" />
      <span>LOGIC</span>
    </div>
  );
}

/**
 * Determines if a node should be treated as a controller based on its properties.
 */
export function isControllerNode(
  node: { label: string; sub: string; shape: string; accent: string }
): boolean {
  // Check by accent color
  if (node.accent === "teal") return true;

  // Check by label patterns (API endpoints, handlers, services)
  const label = node.label.toLowerCase();
  if (label.includes("/api/") || label.includes("controller")) return true;
  if (label.includes("handler") || label.includes("service")) return true;

  // Check by sub patterns
  const sub = node.sub.toLowerCase();
  if (sub.includes("controller") || sub.includes("endpoint")) return true;
  if (sub.includes("handler") || sub.includes("service")) return true;

  return false;
}

/**
 * Classifies nodes by their architectural layer.
 */
export type ArchitecturalLayer = "view" | "controller" | "database" | "validation" | "other";

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

export default ControllerNode;
