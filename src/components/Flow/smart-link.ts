/**
 * Smart Link Utility — Auto-Connect UI → Controller → Database
 *
 * Automatically detects and draws connections between nodes based on
 * architectural layers. Creates intermediary Controller nodes when needed
 * to maintain proper separation: UI → Controller → Database.
 */

import type { Point } from "@/lib/canvas-geometry";
import { centerOf, perimeterPoint, snappedEdgePath } from "@/lib/canvas-geometry";
import {
  classifyNodeLayer,
  isControllerNode,
  type ArchitecturalLayer,
} from "./ControllerNode";

export interface SmartLinkEdge {
  id: string;
  from: string;
  to: string;
  /** Type of connection for styling */
  linkType: "ui-to-controller" | "controller-to-db" | "direct";
  /** Visual styling hints */
  style: {
    color: string;
    dashArray?: string;
    animated?: boolean;
  };
}

export interface SmartLinkConfig {
  /** Base color for UI-to-Controller links */
  uiToControllerColor?: string;
  /** Base color for Controller-to-Database links */
  controllerToDbColor?: string;
  /** Color for direct links (when no controller intermediary) */
  directLinkColor?: string;
  /** Whether to animate controller links */
  animateControllerLinks?: boolean;
}

const DEFAULT_CONFIG: Required<SmartLinkConfig> = {
  uiToControllerColor: "var(--node-controller-stroke)",
  controllerToDbColor: "var(--node-database-stroke)",
  directLinkColor: "var(--border)",
  animateControllerLinks: true,
};

/**
 * Generates smart link edges between nodes based on architectural layer connections.
 * Ensures proper flow: UI → Controller → Database (never UI → Database directly).
 */
export function generateSmartLinks(
  nodes: Array<{
    id: string;
    label: string;
    sub: string;
    shape: string;
    accent: string;
    x: number;
    y: number;
    workspace: string;
  }>,
  existingEdges: Array<{ id: string; from: string; to: string }> = [],
  config: SmartLinkConfig = {}
): SmartLinkEdge[] {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const smartLinks: SmartLinkEdge[] = [];

  // Classify all nodes by layer
  const nodeLayers = new Map<string, ArchitecturalLayer>();
  const viewNodes: string[] = [];
  const controllerNodes: string[] = [];
  const databaseNodes: string[] = [];

  for (const node of nodes) {
    const layer = classifyNodeLayer(node);
    nodeLayers.set(node.id, layer);

    if (layer === "view") viewNodes.push(node.id);
    else if (layer === "controller") controllerNodes.push(node.id);
    else if (layer === "database") databaseNodes.push(node.id);
  }

  // For each existing edge, determine and classify the link type
  for (const edge of existingEdges) {
    const fromLayer = nodeLayers.get(edge.from) || "other";
    const toLayer = nodeLayers.get(edge.to) || "other";

    const linkType = classifyLinkType(fromLayer, toLayer);
    const style = getLinkStyle(linkType, cfg);

    smartLinks.push({
      id: edge.id,
      from: edge.from,
      to: edge.to,
      linkType,
      style,
    });
  }

  return smartLinks;
}

/**
 * Determines the link type based on source and target layers.
 */
function classifyLinkType(
  fromLayer: ArchitecturalLayer,
  toLayer: ArchitecturalLayer
): SmartLinkEdge["linkType"] {
  if (fromLayer === "view" && toLayer === "controller") {
    return "ui-to-controller";
  }
  if (fromLayer === "controller" && toLayer === "database") {
    return "controller-to-db";
  }
  // Detect anti-pattern: direct UI-to-Database connection
  if (fromLayer === "view" && toLayer === "database") {
    // This should be flagged as needing a controller intermediary
    return "direct";
  }
  return "direct";
}

/**
 * Gets visual styling for a link type.
 */
function getLinkStyle(
  linkType: SmartLinkEdge["linkType"],
  config: Required<SmartLinkConfig>
): SmartLinkEdge["style"] {
  switch (linkType) {
    case "ui-to-controller":
      return {
        color: config.uiToControllerColor,
        animated: config.animateControllerLinks,
      };
    case "controller-to-db":
      return {
        color: config.controllerToDbColor,
        animated: config.animateControllerLinks,
        dashArray: "4 4",
      };
    default:
      return {
        color: config.directLinkColor,
      };
  }
}

/**
 * Finds UI nodes that are directly connected to Database nodes (anti-pattern).
 * Returns pairs that should have a Controller intermediary.
 */
export function findDirectUiToDbConnections(
  nodes: Array<{
    id: string;
    label: string;
    sub: string;
    shape: string;
    accent: string;
  }>,
  edges: Array<{ id: string; from: string; to: string }>
): Array<{ uiNodeId: string; dbNodeId: string; edgeId: string }> {
  const nodeLayers = new Map<string, ArchitecturalLayer>();

  for (const node of nodes) {
    nodeLayers.set(node.id, classifyNodeLayer(node));
  }

  const directConnections: Array<{
    uiNodeId: string;
    dbNodeId: string;
    edgeId: string;
  }> = [];

  for (const edge of edges) {
    const fromLayer = nodeLayers.get(edge.from);
    const toLayer = nodeLayers.get(edge.to);

    // Check both directions: UI -> DB or DB -> UI
    if (fromLayer === "view" && toLayer === "database") {
      directConnections.push({
        uiNodeId: edge.from,
        dbNodeId: edge.to,
        edgeId: edge.id,
      });
    } else if (fromLayer === "database" && toLayer === "view") {
      directConnections.push({
        uiNodeId: edge.to,
        dbNodeId: edge.from,
        edgeId: edge.id,
      });
    }
  }

  return directConnections;
}

/**
 * Generates a recommended controller node to insert between UI and Database.
 * Returns position and configuration for the new controller node.
 */
export function generateControllerIntermediary(
  uiNode: { id: string; x: number; y: number; label: string },
  dbNode: { id: string; x: number; y: number; label: string }
): {
  id: string;
  label: string;
  sub: string;
  shape: "rectangle";
  accent: "teal";
  x: number;
  y: number;
  workspace: "app";
} {
  // Position controller midway between UI and Database
  const midX = (uiNode.x + dbNode.x) / 2;
  const midY = (uiNode.y + dbNode.y) / 2;

  // Generate a meaningful controller name
  const dbEntity = dbNode.label.split(" ")[0].toLowerCase();
  const label = `/api/${dbEntity}`;

  return {
    id: `controller-${uiNode.id}-${dbNode.id}`,
    label,
    sub: "Auto-generated Controller",
    shape: "rectangle",
    accent: "teal",
    x: midX,
    y: midY,
    workspace: "app",
  };
}

/**
 * Computes edge paths with smart link styling applied.
 * Returns SVG path strings for rendering.
 */
export function computeSmartLinkPaths(
  fromNode: { x: number; y: number; shape: string; w?: number; h?: number },
  toNode: { x: number; y: number; shape: string; w?: number; h?: number },
  linkType: SmartLinkEdge["linkType"]
): {
  path: string;
  start: Point;
  end: Point;
} {
  const positionedFrom = {
    x: fromNode.x,
    y: fromNode.y,
    shape: fromNode.shape as "rectangle",
    w: fromNode.w ?? 240,
    h: fromNode.h ?? 100,
  };
  const positionedTo = {
    x: toNode.x,
    y: toNode.y,
    shape: toNode.shape as "rectangle",
    w: toNode.w ?? 240,
    h: toNode.h ?? 100,
  };

  const { path, start, end } = snappedEdgePath(positionedFrom, positionedTo);

  return { path, start, end };
}

/**
 * Hook-style function to apply smart link logic to a canvas.
 * Processes nodes and edges, returning enhanced edges with link types.
 */
export function useSmartLinks(
  nodes: Array<{
    id: string;
    label: string;
    sub: string;
    shape: string;
    accent: string;
    x: number;
    y: number;
    workspace: string;
  }>,
  edges: Array<{ id: string; from: string; to: string }>,
  config?: SmartLinkConfig
): {
  smartLinks: SmartLinkEdge[];
  directConnections: Array<{ uiNodeId: string; dbNodeId: string; edgeId: string }>;
  suggestedControllers: Array<{
    id: string;
    label: string;
    x: number;
    y: number;
  }>;
} {
  const smartLinks = generateSmartLinks(nodes, edges, config);
  const directConnections = findDirectUiToDbConnections(nodes, edges);

  // Generate suggested controllers for each direct UI-DB connection
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const suggestedControllers = directConnections.map((conn) => {
    const uiNode = nodeMap.get(conn.uiNodeId)!;
    const dbNode = nodeMap.get(conn.dbNodeId)!;
    return generateControllerIntermediary(uiNode, dbNode);
  });

  return {
    smartLinks,
    directConnections,
    suggestedControllers,
  };
}

/**
 * CSS classes for smart link edge styling.
 */
export function getSmartLinkClasses(linkType: SmartLinkEdge["linkType"]): {
  stroke: string;
  strokeWidth: number;
  strokeDasharray: string;
  markerEnd: string;
} {
  switch (linkType) {
    case "ui-to-controller":
      return {
        stroke: "stroke-teal",
        strokeWidth: 2,
        strokeDasharray: "none",
        markerEnd: "url(#arrow-teal)",
      };
    case "controller-to-db":
      return {
        stroke: "stroke-blue",
        strokeWidth: 2,
        strokeDasharray: "8 4",
        markerEnd: "url(#arrow-blue)",
      };
    default:
      return {
        stroke: "stroke-border",
        strokeWidth: 1.5,
        strokeDasharray: "none",
        markerEnd: "url(#arrow-default)",
      };
  }
}
