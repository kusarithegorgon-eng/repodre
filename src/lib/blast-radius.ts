/**
 * Blast-Radius Impact Analysis Engine
 *
 * Computes the transitive "blast radius" of a node — every file, service, and
 * route that would be affected if the selected component were modified or
 * deleted. Produces a set of affected node IDs plus categorized impact
 * metadata for the What-If simulation overlay.
 */

export type ImpactCategory = "direct-dependent" | "transitive-dependent" | "orphaned-by-deletion" | "route-break";

export interface ImpactNode {
  id: string;
  /** distance from the selected node (0 = the selected node itself) */
  depth: number;
  category: ImpactCategory;
  /** the edge path from the selected node to this node */
  path: string[];
}

export interface BlastRadiusResult {
  /** the origin node ID */
  originId: string;
  /** all affected node IDs (excluding the origin) */
  affectedIds: Set<string>;
  /** categorized impact details per node */
  impacts: Map<string, ImpactNode>;
  /** IDs of edges that would be removed if the origin were deleted */
  brokenEdgeIds: Set<string>;
  /** IDs of routes (view nodes) that would lose a dependency */
  affectedRouteIds: Set<string>;
}

/**
 * Compute the blast radius of a node in the dependency graph.
 *
 * Traverses both forward (downstream consumers) and backward (upstream
 * providers) so the user sees the full impact of modifying or deleting
 * the selected component.
 *
 * @param originId - the node to analyze
 * @param nodes - all canvas nodes
 * @param edges - all canvas edges (directed: from -> to)
 */
export function computeBlastRadius(
  originId: string,
  nodes: Array<{ id: string; label: string; shape: string }>,
  edges: Array<{ id: string; from: string; to: string }>,
): BlastRadiusResult {
  const affectedIds = new Set<string>();
  const impacts = new Map<string, ImpactNode>();
  const brokenEdgeIds = new Set<string>();
  const affectedRouteIds = new Set<string>();

  // Edges that touch the origin — these break on deletion
  for (const e of edges) {
    if (e.from === originId || e.to === originId) {
      brokenEdgeIds.add(e.id);
    }
  }

  // Build adjacency (forward + reverse)
  const forward = new Map<string, string[]>();
  const reverse = new Map<string, string[]>();
  for (const n of nodes) {
    forward.set(n.id, []);
    reverse.set(n.id, []);
  }
  for (const e of edges) {
    forward.get(e.from)?.push(e.to);
    reverse.get(e.to)?.push(e.from);
  }

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  // BFS forward (downstream: who depends on this node's output)
  const forwardVisited = new Set<string>([originId]);
  const forwardQueue: Array<{ id: string; depth: number; path: string[] }> = [];
  for (const next of forward.get(originId) ?? []) {
    forwardQueue.push({ id: next, depth: 1, path: [originId, next] });
  }
  while (forwardQueue.length > 0) {
    const cur = forwardQueue.shift()!;
    if (forwardVisited.has(cur.id)) continue;
    forwardVisited.add(cur.id);
    affectedIds.add(cur.id);

    const node = nodeMap.get(cur.id);
    const category: ImpactCategory = cur.depth === 1 ? "direct-dependent" : "transitive-dependent";
    impacts.set(cur.id, { id: cur.id, depth: cur.depth, category, path: cur.path });

    if (node && (node.shape === "pill" || node.shape === "rectangle")) {
      affectedRouteIds.add(cur.id);
    }

    for (const next of forward.get(cur.id) ?? []) {
      if (!forwardVisited.has(next)) {
        forwardQueue.push({ id: next, depth: cur.depth + 1, path: [...cur.path, next] });
      }
    }
  }

  // BFS backward (upstream: what this node depends on — deletion orphans these)
  const reverseVisited = new Set<string>([originId]);
  const reverseQueue: Array<{ id: string; depth: number; path: string[] }> = [];
  for (const prev of reverse.get(originId) ?? []) {
    reverseQueue.push({ id: prev, depth: 1, path: [originId, prev] });
  }
  while (reverseQueue.length > 0) {
    const cur = reverseQueue.shift()!;
    if (reverseVisited.has(cur.id)) continue;
    reverseVisited.add(cur.id);
    // Only add as affected if not already captured forward
    if (!affectedIds.has(cur.id)) {
      affectedIds.add(cur.id);
      impacts.set(cur.id, {
        id: cur.id,
        depth: cur.depth,
        category: "orphaned-by-deletion",
        path: cur.path,
      });
    }

    for (const prev of reverse.get(cur.id) ?? []) {
      if (!reverseVisited.has(prev)) {
        reverseQueue.push({ id: prev, depth: cur.depth + 1, path: [...cur.path, prev] });
      }
    }
  }

  return { originId, affectedIds, impacts, brokenEdgeIds, affectedRouteIds };
}

/**
 * Simulate the deletion of a node and return a human-readable summary
 * of the breaking changes that would occur.
 */
export function simulateDeletion(
  originId: string,
  nodes: Array<{ id: string; label: string; shape: string }>,
  edges: Array<{ id: string; from: string; to: string }>,
): {
  deletedNodeCount: number;
  brokenEdgeCount: number;
  affectedRoutes: string[];
  affectedServices: string[];
  summary: string;
} {
  const result = computeBlastRadius(originId, nodes, edges);
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  const affectedRoutes: string[] = [];
  const affectedServices: string[] = [];

  for (const id of result.affectedIds) {
    const n = nodeMap.get(id);
    if (!n) continue;
    if (n.shape === "pill") affectedRoutes.push(n.label);
    if (n.shape === "rectangle") affectedServices.push(n.label);
  }

  const summary = `Deleting this node would break ${result.brokenEdgeIds.size} connection(s) and impact ${result.affectedIds.size} other component(s): ${affectedRoutes.length} route(s) and ${affectedServices.length} service(s) in the blast radius.`;

  return {
    deletedNodeCount: 1,
    brokenEdgeCount: result.brokenEdgeIds.size,
    affectedRoutes,
    affectedServices,
    summary,
  };
}
