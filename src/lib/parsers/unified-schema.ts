/**
 * Unified JSON Schema Normalizer
 *
 * Converts ParsedModule results from any language parser into a single,
 * uniform JSON schema that the frontend canvas renders identically
 * regardless of the source repository's programming language:
 *
 * {
 *   "nodes": [{ "id": "...", "type": "...", "metadata": {...} }],
 *   "edges": [{ "source": "...", "target": "..." }]
 * }
 */

import type { ParsedModule, UniversalNode } from "./types";

export interface UnifiedNode {
  id: string;
  type: NodeType;
  label: string;
  filePath: string;
  language: string;
  metadata: NodeMetadata;
}

export interface UnifiedEdge {
  source: string;
  target: string;
  type: EdgeType;
}

export interface UnifiedSchema {
  nodes: UnifiedNode[];
  edges: UnifiedEdge[];
}

export type NodeType =
  | "module"
  | "class"
  | "interface"
  | "function"
  | "method"
  | "variable"
  | "import"
  | "route"
  | "controller"
  | "model"
  | "service"
  | "repository"
  | "component";

export type EdgeType = "import" | "call" | "inherit" | "reference" | "route";

export interface NodeMetadata {
  exported: boolean;
  async?: boolean;
  params?: string[];
  returnType?: string;
  startRow?: number;
  endRow?: number;
  [key: string]: unknown;
}

function mapClassType(kind: string): NodeType {
  if (kind === "model") return "model";
  if (kind === "controller") return "controller";
  if (kind === "service") return "service";
  if (kind === "repository") return "repository";
  return "class";
}

function findNodeRow(ast: UniversalNode, nodeId: string): number | undefined {
  if (ast.id === nodeId) return ast.start.row;
  for (const child of ast.children) {
    const found = findNodeRow(child, nodeId);
    if (found !== undefined) return found;
  }
  return undefined;
}

function resolveRelativePath(fromPath: string, importSpecifier: string): string {
  const dir = fromPath.substring(0, fromPath.lastIndexOf("/"));
  const parts = (dir + "/" + importSpecifier).split("/");
  const resolved: string[] = [];
  for (const part of parts) {
    if (part === "..") {
      resolved.pop();
    } else if (part !== ".") {
      resolved.push(part);
    }
  }
  return resolved.join("/");
}

function extractInheritanceEdges(ast: UniversalNode, edges: UnifiedEdge[]): void {
  const traverse = (node: UniversalNode) => {
    if (
      node.kind === "class_declaration" ||
      node.kind === "class_definition" ||
      node.kind === "php_class" ||
      node.kind === "php_eloquent_model"
    ) {
      // Single parent (Java, Go, PHP, TS)
      const parent = node.meta?.parent as string | undefined;
      if (parent) {
        edges.push({
          source: node.id,
          target: `class:${parent}`,
          type: "inherit",
        });
      }
      // Multiple parents (C++, C#)
      const parents = node.meta?.parents as string[] | undefined;
      if (parents && Array.isArray(parents)) {
        for (const p of parents) {
          edges.push({
            source: node.id,
            target: `class:${p}`,
            type: "inherit",
          });
        }
      }
    }
    for (const child of node.children) {
      traverse(child);
    }
  };
  traverse(ast);
}

function extractRouteEdges(ast: UniversalNode, edges: UnifiedEdge[]): void {
  const traverse = (node: UniversalNode) => {
    if (node.kind === "php_call" && node.meta?.edge) {
      const edge = node.meta.edge as { source: string; target: string };
      edges.push({ source: edge.source, target: edge.target, type: "route" });
    }
    if (node.kind === "decorator" && node.meta?.route) {
      const route = node.meta.route as string;
      const verb = node.meta.verb as string;
      edges.push({
        source: `route:${verb}:${route}`,
        target: node.parentId ?? "",
        type: "route",
      });
    }
    // C# route attributes are stored on method nodes directly
    if (node.kind === "method_definition" && node.meta?.route) {
      const route = node.meta.route as string;
      const verb = node.meta.verb as string;
      edges.push({
        source: `route:${verb}:${route}`,
        target: node.parentId ?? "",
        type: "route",
      });
    }
    for (const child of node.children) {
      traverse(child);
    }
  };
  traverse(ast);
}

export function normalizeModule(module: ParsedModule): { nodes: UnifiedNode[]; edges: UnifiedEdge[] } {
  const nodes: UnifiedNode[] = [];
  const edges: UnifiedEdge[] = [];

  const moduleId = `module:${module.path}`;
  nodes.push({
    id: moduleId,
    type: "module",
    label: module.path.split("/").pop() ?? module.path,
    filePath: module.path,
    language: module.language,
    metadata: { exported: false, startRow: 0, endRow: module.ast.end.row },
  });

  const symbols = module.symbols;

  for (const cls of symbols.classes) {
    nodes.push({
      id: cls.nodeId,
      type: mapClassType(cls.kind),
      label: cls.name,
      filePath: module.path,
      language: module.language,
      metadata: {
        exported: cls.exported,
        startRow: findNodeRow(module.ast, cls.nodeId),
      },
    });
    edges.push({ source: moduleId, target: cls.nodeId, type: "reference" });
  }

  for (const fn of symbols.functions) {
    nodes.push({
      id: fn.nodeId,
      type: fn.kind === "route" ? "route" : "function",
      label: fn.name,
      filePath: module.path,
      language: module.language,
      metadata: {
        exported: fn.exported,
        async: fn.async,
        params: fn.params,
        returnType: fn.returnType,
        startRow: findNodeRow(module.ast, fn.nodeId),
      },
    });
    edges.push({ source: moduleId, target: fn.nodeId, type: "reference" });
  }

  for (const v of symbols.variables) {
    nodes.push({
      id: v.nodeId,
      type: "variable",
      label: v.name,
      filePath: module.path,
      language: module.language,
      metadata: { exported: v.exported, startRow: findNodeRow(module.ast, v.nodeId) },
    });
  }

  for (const c of symbols.components) {
    nodes.push({
      id: c.nodeId,
      type: "component",
      label: c.name,
      filePath: module.path,
      language: module.language,
      metadata: { exported: c.exported, startRow: findNodeRow(module.ast, c.nodeId) },
    });
  }

  for (const imp of symbols.imports) {
    const targetId = imp.specifier.startsWith(".")
      ? `module:${resolveRelativePath(module.path, imp.specifier)}`
      : `module:${imp.specifier}`;
    edges.push({ source: moduleId, target: targetId, type: "import" });
  }

  extractInheritanceEdges(module.ast, edges);
  extractRouteEdges(module.ast, edges);

  return { nodes, edges };
}

export function normalizeModules(modules: ParsedModule[]): UnifiedSchema {
  const allNodes: UnifiedNode[] = [];
  const allEdges: UnifiedEdge[] = [];
  const seenNodeIds = new Set<string>();
  const seenEdges = new Set<string>();

  for (const mod of modules) {
    const { nodes, edges } = normalizeModule(mod);
    for (const n of nodes) {
      if (!seenNodeIds.has(n.id)) {
        seenNodeIds.add(n.id);
        allNodes.push(n);
      }
    }
    for (const e of edges) {
      const key = `${e.source}->${e.target}:${e.type}`;
      if (!seenEdges.has(key)) {
        seenEdges.add(key);
        allEdges.push(e);
      }
    }
  }

  return { nodes: allNodes, edges: allEdges };
}
