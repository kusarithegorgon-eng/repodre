import type { RepoNode } from "./github";
import type { GraphNode, GraphEdge } from "./elk-layout";

export interface BuiltGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

function baseName(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1] || path;
}

export function buildGraph(tree: RepoNode[]): BuiltGraph {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const seen = new Set<string>();

  const ensureDir = (path: string) => {
    if (path === "" || seen.has(path)) return;
    seen.add(path);
    nodes.push({ id: path, label: baseName(path), type: "dir", path });
    const parent = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
    if (parent) {
      ensureDir(parent);
      edges.push({ id: `${parent}->${path}`, source: parent, target: path });
    }
  };

  for (const item of tree) {
    if (item.type === "tree") {
      ensureDir(item.path);
    } else {
      if (!seen.has(item.path)) {
        seen.add(item.path);
        nodes.push({ id: item.path, label: baseName(item.path), type: "file", path: item.path });
      }
      const parent = item.path.includes("/") ? item.path.slice(0, item.path.lastIndexOf("/")) : "";
      if (parent) {
        ensureDir(parent);
        edges.push({ id: `${parent}->${item.path}`, source: parent, target: item.path });
      }
    }
  }

  return { nodes, edges };
}
