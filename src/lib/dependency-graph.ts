/**
 * Dependency Graph Builder
 *
 * Constructs an execution flow graph from parsed modules.
 * Resolves import paths to create edges between nodes.
 */

import type { PositionedNode, Shape } from "./canvas-geometry";
import { NODE_W, NODE_H } from "./canvas-geometry";
import type { ParsedModule } from "./ast-parser";
import { inferNodeType, generateNodeLabel, generateNodeSubtype } from "./ast-parser";

export interface DependencyNode extends PositionedNode {
  id: string;
  label: string;
  sub: string;
  shape: Shape;
  accent: "green" | "purple" | "teal" | "blue";
  path: string;
  imports: string[];
  exports: string[];
}

export interface DependencyEdge {
  id: string;
  from: string;
  to: string;
  fromHandle?: string;
  toHandle?: string;
}

export interface DependencyGraph {
  nodes: DependencyNode[];
  edges: DependencyEdge[];
}

/**
 * Resolve a relative import path to an absolute path within the project.
 */
function resolveImportPath(importPath: string, fromPath: string): string | null {
  // Skip external modules
  if (!importPath.startsWith(".") && !importPath.startsWith("/")) {
    return null;
  }

  // Get the directory of the importing file
  const fromDir = fromPath.substring(0, fromPath.lastIndexOf("/"));

  // Resolve relative paths
  let resolved: string;
  if (importPath.startsWith("./")) {
    resolved = `${fromDir}/${importPath.substring(2)}`;
  } else if (importPath.startsWith("../")) {
    const parts = fromDir.split("/");
    const importParts = importPath.split("/");

    for (const part of importParts) {
      if (part === "..") {
        parts.pop();
      } else {
        parts.push(part);
      }
    }
    resolved = parts.join("/");
  } else {
    resolved = importPath;
  }

  // Add common extensions if missing
  const extensions = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];
  if (!extensions.some((ext) => resolved.endsWith(ext))) {
    for (const ext of extensions) {
      const withExt = resolved + ext;
      return withExt;
    }
    // Try index files
    for (const ext of extensions) {
      return `${resolved}/index${ext}`;
    }
  }

  return resolved;
}

/**
 * Map node type to shape.
 */
function nodeTypeToShape(type: ReturnType<typeof inferNodeType>): Shape {
  switch (type) {
    case "endpoint":
      return "pill";
    case "middleware":
      return "diamond";
    case "model":
      return "cylinder";
    default:
      return "rectangle";
  }
}

/**
 * Map node type to accent color.
 */
function nodeTypeToAccent(type: ReturnType<typeof inferNodeType>): "green" | "purple" | "teal" | "blue" {
  switch (type) {
    case "endpoint":
      return "green";
    case "middleware":
      return "purple";
    case "model":
      return "blue";
    default:
      return "teal";
  }
}

let nodeIdCounter = 0;
function generateNodeId(): string {
  return `node_${++nodeIdCounter}_${Date.now().toString(36)}`;
}

let edgeIdCounter = 0;
function generateEdgeId(): string {
  return `edge_${++edgeIdCounter}_${Date.now().toString(36)}`;
}

/**
 * Calculate automatic layout positions for nodes.
 * Uses a simple topological sort and layered layout.
 */
function calculateLayout(
  nodes: Omit<DependencyNode, "x" | "y">[],
  edges: { from: string; to: string }[]
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  // Build adjacency list for dependency tracking
  const dependencies = new Map<string, Set<string>>();
  const dependents = new Map<string, Set<string>>();

  for (const n of nodes) {
    dependencies.set(n.id, new Set());
    dependents.set(n.id, new Set());
  }

  for (const e of edges) {
    dependencies.get(e.to)?.add(e.from);
    dependents.get(e.from)?.add(e.to);
  }

  // Calculate depth (distance from roots)
  const depths = new Map<string, number>();
  const queue: string[] = [];

  // Start with root nodes (no dependencies)
  for (const n of nodes) {
    if (dependencies.get(n.id)?.size === 0) {
      depths.set(n.id, 0);
      queue.push(n.id);
    }
  }

  // BFS to calculate depths
  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentDepth = depths.get(current) ?? 0;

    for (const dependent of dependents.get(current) ?? []) {
      const existing = depths.get(dependent);
      if (existing === undefined || existing < currentDepth + 1) {
        depths.set(dependent, currentDepth + 1);
        queue.push(dependent);
      }
    }
  }

  // Assign missing depths to remaining nodes
  let maxDepth = Math.max(...Array.from(depths.values()), 0);
  for (const n of nodes) {
    if (!depths.has(n.id)) {
      depths.set(n.id, ++maxDepth);
    }
  }

  // Group nodes by depth
  const depthGroups = new Map<number, string[]>();
  for (const [id, depth] of depths) {
    if (!depthGroups.has(depth)) {
      depthGroups.set(depth, []);
    }
    depthGroups.get(depth)!.push(id);
  }

  // Position nodes in layers
  const HORIZONTAL_GAP = 120;
  const VERTICAL_GAP = 200;
  const START_X = 90;
  const START_Y = 80;

  for (const [depth, group] of depthGroups) {
    const y = START_Y + depth * VERTICAL_GAP;
    const totalWidth = group.length * NODE_W + (group.length - 1) * HORIZONTAL_GAP;

    group.forEach((id, index) => {
      const x = START_X + index * (NODE_W + HORIZONTAL_GAP);
      positions.set(id, { x, y });
    });
  }

  return positions;
}

/**
 * Build a dependency graph from parsed modules.
 */
export function buildDependencyGraph(
  modules: ParsedModule[],
  basePath = ""
): DependencyGraph {
  // Reset counters for deterministic IDs
  nodeIdCounter = 0;
  edgeIdCounter = 0;

  // Create nodes from modules
  const nodeLookup = new Map<string, DependencyNode>();
  const pathToId = new Map<string, string>();

  for (const mod of modules) {
    const normalizedPath = mod.path.startsWith(basePath)
      ? mod.path.substring(basePath.length)
      : mod.path;

    const nodeType = inferNodeType(normalizedPath);
    const id = generateNodeId();

    const node: DependencyNode = {
      id,
      label: generateNodeLabel(normalizedPath),
      sub: generateNodeSubtype(normalizedPath, nodeType),
      shape: nodeTypeToShape(nodeType),
      accent: nodeTypeToAccent(nodeType),
      path: normalizedPath,
      x: 0,
      y: 0,
      imports: mod.imports.map((i) => i.source),
      exports: mod.exports.map((e) => e.name),
    };

    nodeLookup.set(id, node);
    pathToId.set(normalizedPath, id);
  }

  // Build edges from imports
  const edges: DependencyEdge[] = [];

  for (const mod of modules) {
    const normalizedPath = mod.path.startsWith(basePath)
      ? mod.path.substring(basePath.length)
      : mod.path;

    const fromId = pathToId.get(normalizedPath);
    if (!fromId) continue;

    for (const imp of mod.imports) {
      const resolvedPath = resolveImportPath(imp.source, normalizedPath);
      if (!resolvedPath) continue;

      const toId = pathToId.get(resolvedPath);
      if (toId && toId !== fromId) {
        // Avoid duplicate edges
        const existing = edges.find((e) => e.from === fromId && e.to === toId);
        if (!existing) {
          edges.push({
            id: generateEdgeId(),
            from: fromId,
            to: toId,
          });
        }
      }
    }
  }

  // Calculate layout positions
  const nodes = Array.from(nodeLookup.values());
  const positions = calculateLayout(
    nodes.map((n) => ({ ...n })),
    edges
  );

  // Apply positions
  for (const node of nodes) {
    const pos = positions.get(node.id);
    if (pos) {
      node.x = pos.x;
      node.y = pos.y;
    }
  }

  return { nodes, edges };
}

/**
 * Merge a generated graph with existing user modifications.
 */
export function mergeWithExisting(
  generated: DependencyGraph,
  existing: { nodes: DependencyNode[]; edges: DependencyEdge[] }
): DependencyGraph {
  const existingNodes = new Map(existing.nodes.map((n) => [n.path, n]));
  const mergedNodes: DependencyNode[] = [];

  for (const gen of generated.nodes) {
    const existingNode = existingNodes.get(gen.path);
    if (existingNode) {
      // Preserve position and any user customizations
      mergedNodes.push({
        ...gen,
        x: existingNode.x,
        y: existingNode.y,
        shape: existingNode.shape,
        accent: existingNode.accent,
        label: existingNode.label,
        sub: existingNode.sub,
      });
    } else {
      mergedNodes.push(gen);
    }
  }

  return {
    nodes: mergedNodes,
    edges: generated.edges,
  };
}
