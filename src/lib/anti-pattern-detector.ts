/**
 * Architectural Code Debt Anomaly Sweeper
 *
 * Scans relationship edge matrices to detect anti-patterns in the system architecture.
 * Flags View nodes that bypass Controller layers to directly access Database nodes.
 */

export interface AntiPatternWarning {
  id: string;
  type: "view-to-db-bypass" | "missing-validation" | "orphaned-node" | "circular-dependency" | "god-class" | "oversized-file";
  severity: "critical" | "high" | "medium" | "low";
  nodeId: string;
  nodeLabel: string;
  description: string;
  impactedNodes: string[];
  recommendation: string;
}

export interface AntiPatternResult {
  warnings: AntiPatternWarning[];
  viewToDbBypassCount: number;
  missingValidationCount: number;
  orphanedNodesCount: number;
  godClassCount: number;
  oversizedFileCount: number;
}

export type NodeType = "view" | "validation" | "controller" | "database" | "gateway" | "error";

interface NodeInfo {
  id: string;
  label: string;
  type: NodeType;
  shape: string;
}

interface EdgeInfo {
  id: string;
  from: string;
  to: string;
}

/**
 * Detects View nodes that directly connect to Database nodes without an intervening Controller.
 * This is an architectural anti-pattern that violates the separation of concerns principle.
 */
function detectViewToDbBypass(
  nodes: NodeInfo[],
  edges: EdgeInfo[]
): AntiPatternWarning[] {
  const warnings: AntiPatternWarning[] = [];

  // Build adjacency maps
  const outgoingEdges = new Map<string, string[]>();
  const incomingEdges = new Map<string, string[]>();

  for (const edge of edges) {
    if (!outgoingEdges.has(edge.from)) outgoingEdges.set(edge.from, []);
    outgoingEdges.get(edge.from)!.push(edge.to);

    if (!incomingEdges.has(edge.to)) incomingEdges.set(edge.to, []);
    incomingEdges.get(edge.to)!.push(edge.from);
  }

  // Index nodes by ID for quick lookup
  const nodeMap = new Map<string, NodeInfo>();
  for (const node of nodes) {
    nodeMap.set(node.id, node);
  }

  // Find all view nodes
  const viewNodes = nodes.filter(
    (n) => n.type === "view" || n.shape === "pill"
  );

  // For each view node, check if it has a direct path to a database node
  for (const viewNode of viewNodes) {
    const directTargets = outgoingEdges.get(viewNode.id) || [];

    for (const targetId of directTargets) {
      const targetNode = nodeMap.get(targetId);
      if (!targetNode) continue;

      // Check if target is a database node
      if (targetNode.type === "database" || targetNode.shape === "cylinder") {
        // Anti-pattern detected: View -> Database direct connection
        warnings.push({
          id: `anti-pattern_view-db_${viewNode.id}_${targetId}`,
          type: "view-to-db-bypass",
          severity: "high",
          nodeId: viewNode.id,
          nodeLabel: viewNode.label,
          description: `View "${viewNode.label}" directly accesses Database "${targetNode.label}" without a Controller intermediary.`,
          impactedNodes: [viewNode.id, targetId],
          recommendation:
            "Introduce a Controller layer to handle business logic, validation, and data transformation between the View and Database.",
        });
      }
    }

    // Also check for 2-hop paths that skip controller: View -> X -> Database where X is not a controller
    const visited = new Set<string>([viewNode.id]);
    const queue: Array<{ id: string; path: string[]; depth: number }> = [
      { id: viewNode.id, path: [viewNode.id], depth: 0 },
    ];

    while (queue.length > 0) {
      const { id: currentId, path, depth } = queue.shift()!;

      if (depth >= 3) continue; // Max depth for checking

      const neighbors = outgoingEdges.get(currentId) || [];
      for (const neighborId of neighbors) {
        if (visited.has(neighborId)) continue;
        visited.add(neighborId);

        const neighborNode = nodeMap.get(neighborId);
        if (!neighborNode) continue;

        const newPath = [...path, neighborId];

        // Check if this is a database node and the path doesn't include a controller
        if (
          (neighborNode.type === "database" || neighborNode.shape === "cylinder") &&
          depth > 0
        ) {
          // Check if any intermediate node is a controller
          const hasController = path.slice(1).some((pathNodeId) => {
            const pathNode = nodeMap.get(pathNodeId);
            return pathNode && (pathNode.type === "controller" || pathNode.shape === "rectangle");
          });

          if (!hasController) {
            // Report this as a potential issue if not already reported
            const existingWarning = warnings.find(
              (w) => w.nodeId === viewNode.id && w.impactedNodes.includes(neighborId)
            );

            if (!existingWarning) {
              warnings.push({
                id: `anti-pattern_view-db-path_${viewNode.id}_${neighborId}`,
                type: "view-to-db-bypass",
                severity: "medium",
                nodeId: viewNode.id,
                nodeLabel: viewNode.label,
                description: `View "${viewNode.label}" reaches Database "${neighborNode.label}" through a ${depth + 1}-hop path without passing through a Controller layer.`,
                impactedNodes: [...newPath],
                recommendation:
                  "Refactor the architecture to ensure all database access flows through a Controller layer for proper separation of concerns.",
              });
            }
          }
        }

        queue.push({ id: neighborId, path: newPath, depth: depth + 1 });
      }
    }
  }

  return warnings;
}

/**
 * Detects nodes that have no connections (orphaned nodes).
 */
function detectOrphanedNodes(
  nodes: NodeInfo[],
  edges: EdgeInfo[]
): AntiPatternWarning[] {
  const warnings: AntiPatternWarning[] = [];
  const connectedNodes = new Set<string>();

  for (const edge of edges) {
    connectedNodes.add(edge.from);
    connectedNodes.add(edge.to);
  }

  for (const node of nodes) {
    if (!connectedNodes.has(node.id)) {
      warnings.push({
        id: `anti-pattern_orphaned_${node.id}`,
        type: "orphaned-node",
        severity: "low",
        nodeId: node.id,
        nodeLabel: node.label,
        description: `Node "${node.label}" is isolated with no incoming or outgoing connections.`,
        impactedNodes: [node.id],
        recommendation:
          "Connect this node to the execution flow or remove it if no longer needed.",
      });
    }
  }

  return warnings;
}

/**
 * Detects routes (view nodes) that don't pass through validation before reaching controllers.
 */
function detectMissingValidation(
  nodes: NodeInfo[],
  edges: EdgeInfo[]
): AntiPatternWarning[] {
  const warnings: AntiPatternWarning[] = [];

  // Build adjacency map
  const outgoingEdges = new Map<string, string[]>();
  for (const edge of edges) {
    if (!outgoingEdges.has(edge.from)) outgoingEdges.set(edge.from, []);
    outgoingEdges.get(edge.from)!.push(edge.to);
  }

  const nodeMap = new Map<string, NodeInfo>();
  for (const node of nodes) {
    nodeMap.set(node.id, node);
  }

  // Find all view nodes
  const viewNodes = nodes.filter(
    (n) => n.type === "view" || n.shape === "pill"
  );

  for (const viewNode of viewNodes) {
    const directTargets = outgoingEdges.get(viewNode.id) || [];

    for (const targetId of directTargets) {
      const targetNode = nodeMap.get(targetId);
      if (!targetNode) continue;

      // Check if the view directly connects to a controller without validation
      if (
        (targetNode.type === "controller" || targetNode.shape === "rectangle") &&
        !targetNode.label.toLowerCase().includes("public")
      ) {
        // Check if there's a validation diamond between this view and controller
        const hasValidation = edges.some(
          (e) =>
            e.from === viewNode.id &&
            e.to !== targetId &&
            outgoingEdges.get(e.to)?.includes(targetId)
        );

        const validationNeighbor = directTargets.find((id) => {
          const n = nodeMap.get(id);
          return n && (n.type === "validation" || n.shape === "diamond");
        });

        if (!validationNeighbor) {
          warnings.push({
            id: `anti-pattern_no-validation_${viewNode.id}_${targetId}`,
            type: "missing-validation",
            severity: "medium",
            nodeId: viewNode.id,
            nodeLabel: viewNode.label,
            description: `View "${viewNode.label}" routes directly to Controller "${targetNode.label}" without input validation.`,
            impactedNodes: [viewNode.id, targetId],
            recommendation:
              "Add a validation layer (Zod schema, TypeScript guards) before the controller to sanitize and validate incoming request data.",
          });
        }
      }
    }
  }

  return warnings;
}

/**
 * Detects circular dependency chains in the graph using DFS with a visited Set.
 * A cycle (e.g., A → B → A) would cause infinite recursion in layout traversal
 * and indicates a broken architecture. Short-circuits on the first revisit.
 */
function detectCircularDependencies(
  nodes: NodeInfo[],
  edges: EdgeInfo[]
): AntiPatternWarning[] {
  const warnings: AntiPatternWarning[] = [];
  const outgoing = new Map<string, string[]>();
  for (const edge of edges) {
    if (!outgoing.has(edge.from)) outgoing.set(edge.from, []);
    outgoing.get(edge.from)!.push(edge.to);
  }
  const nodeMap = new Map<string, NodeInfo>();
  for (const node of nodes) nodeMap.set(node.id, node);

  for (const start of nodes) {
    const visited = new Set<string>();
    const stack: string[] = [start.id];
    while (stack.length > 0) {
      const cur = stack.pop()!;
      if (visited.has(cur)) {
        const cycleNode = nodeMap.get(cur);
        if (cycleNode) {
          warnings.push({
            id: `anti-pattern_circular_${start.id}_${cur}`,
            type: "circular-dependency",
            severity: "critical",
            nodeId: cycleNode.id,
            nodeLabel: cycleNode.label,
            description: `Circular dependency detected involving "${cycleNode.label}". A chain of references loops back to itself, which can cause infinite recursion at runtime.`,
            impactedNodes: [...visited],
            recommendation: "Break the cycle by removing one edge in the loop, or introduce an intermediary that breaks the direct circular reference.",
          });
        }
        break; // short-circuit — one cycle per start node is enough
      }
      visited.add(cur);
      for (const next of outgoing.get(cur) ?? []) stack.push(next);
    }
  }
  // Deduplicate by impactedNodes signature
  const seen = new Set<string>();
  return warnings.filter((w) => {
    const key = [...w.impactedNodes].sort().join("→");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Main entry point: scans the architecture for anti-patterns.
 */
export function detectAntiPatterns(
  nodes: Array<{
    id: string;
    label: string;
    sub?: string;
    shape: string;
  }>,
  edges: Array<{ id: string; from: string; to: string }>
): AntiPatternResult {
  // Convert nodes to canonical type
  const nodeInfos: NodeInfo[] = nodes.map((n) => ({
    id: n.id,
    label: n.label,
    type: inferTypeFromShape(n.shape, n.sub),
    shape: n.shape,
  }));

  const edgeInfos: EdgeInfo[] = edges.map((e) => ({
    id: e.id,
    from: e.from,
    to: e.to,
  }));

  const viewToDbWarnings = detectViewToDbBypass(nodeInfos, edgeInfos);
  const orphanedWarnings = detectOrphanedNodes(nodeInfos, edgeInfos);
  const missingValidationWarnings = detectMissingValidation(nodeInfos, edgeInfos);
  const circularWarnings = detectCircularDependencies(nodeInfos, edgeInfos);
  const godClassWarnings = detectGodClasses(nodeInfos, edgeInfos);
  const oversizedWarnings = detectOversizedFiles(nodeInfos, edgeInfos);

  const allWarnings = [
    ...viewToDbWarnings,
    ...orphanedWarnings,
    ...missingValidationWarnings,
    ...circularWarnings,
    ...godClassWarnings,
    ...oversizedWarnings,
  ];

  return {
    warnings: allWarnings,
    viewToDbBypassCount: viewToDbWarnings.length,
    missingValidationCount: missingValidationWarnings.length,
    orphanedNodesCount: orphanedWarnings.length,
    godClassCount: godClassWarnings.length,
    oversizedFileCount: oversizedWarnings.length,
  };
}

function inferTypeFromShape(
  shape: string,
  sub?: string
): NodeType {
  switch (shape) {
    case "pill":
      return "view";
    case "diamond":
      return "validation";
    case "rectangle":
      return "controller";
    case "cylinder":
      return "database";
    case "hexagon":
    case "parallelogram":
      return "gateway";
    case "triangle":
      return "error";
    default:
      if (sub?.toLowerCase().includes("view") || sub?.toLowerCase().includes("endpoint")) {
        return "view";
      }
      if (sub?.toLowerCase().includes("controller")) {
        return "controller";
      }
      if (sub?.toLowerCase().includes("validation")) {
        return "validation";
      }
      if (sub?.toLowerCase().includes("database") || sub?.toLowerCase().includes("table")) {
        return "database";
      }
      return "controller";
  }
}

/**
 * Detects God-class anti-pattern: a controller node with an excessive number
 * of outgoing connections (high fan-out), indicating it handles too many
 * responsibilities and should be split into smaller controllers.
 */
function detectGodClasses(
  nodes: NodeInfo[],
  edges: EdgeInfo[]
): AntiPatternWarning[] {
  const warnings: AntiPatternWarning[] = [];

  // Count outgoing edges per node
  const outCount = new Map<string, number>();
  for (const edge of edges) {
    outCount.set(edge.from, (outCount.get(edge.from) ?? 0) + 1);
  }

  // God-class threshold: a controller with 6+ outgoing dependencies
  const GOD_CLASS_THRESHOLD = 6;

  for (const node of nodes) {
    if (node.type !== "controller" && node.shape !== "rectangle") continue;
    const fanOut = outCount.get(node.id) ?? 0;
    if (fanOut >= GOD_CLASS_THRESHOLD) {
      const impacted = edges
        .filter((e) => e.from === node.id)
        .map((e) => e.to);
      warnings.push({
        id: `anti-pattern_god-class_${node.id}`,
        type: "god-class",
        severity: fanOut >= 10 ? "high" : "medium",
        nodeId: node.id,
        nodeLabel: node.label,
        description: `Controller "${node.label}" has ${fanOut} outgoing dependencies (God-class). It handles too many responsibilities and should be split.`,
        impactedNodes: [node.id, ...impacted],
        recommendation: `Split "${node.label}" into ${Math.ceil(fanOut / 3)} smaller controllers, each handling a single resource domain.`,
      });
    }
  }

  return warnings;
}

/**
 * Detects oversized-file anti-pattern: a node that is the target of an
 * excessive number of incoming edges (high fan-in), suggesting it is a
 * catch-all module that should be decomposed.
 */
function detectOversizedFiles(
  nodes: NodeInfo[],
  edges: EdgeInfo[]
): AntiPatternWarning[] {
  const warnings: AntiPatternWarning[] = [];

  // Count incoming edges per node
  const inCount = new Map<string, number>();
  for (const edge of edges) {
    inCount.set(edge.to, (inCount.get(edge.to) ?? 0) + 1);
  }

  // Oversized-file threshold: 8+ incoming dependencies (excluding databases)
  const OVERSIZED_THRESHOLD = 8;

  for (const node of nodes) {
    if (node.type === "database" || node.shape === "cylinder") continue;
    const fanIn = inCount.get(node.id) ?? 0;
    if (fanIn >= OVERSIZED_THRESHOLD) {
      const impacted = edges
        .filter((e) => e.to === node.id)
        .map((e) => e.from);
      warnings.push({
        id: `anti-pattern_oversized_${node.id}`,
        type: "oversized-file",
        severity: fanIn >= 12 ? "high" : "medium",
        nodeId: node.id,
        nodeLabel: node.label,
        description: `"${node.label}" is referenced by ${fanIn} other components (oversized module). It likely contains too much logic in a single file.`,
        impactedNodes: [node.id, ...impacted],
        recommendation: `Decompose "${node.label}" into smaller, focused modules. Each module should have a single responsibility and fewer than ${OVERSIZED_THRESHOLD} consumers.`,
      });
    }
  }

  return warnings;
}

/**
 * Returns anti-pattern warnings for a specific node.
 */
export function getWarningsForNode(
  nodeId: string,
  warnings: AntiPatternWarning[]
): AntiPatternWarning[] {
  return warnings.filter(
    (w) =>
      w.nodeId === nodeId ||
      w.impactedNodes.includes(nodeId)
  );
}

/**
 * Checks if a node has a View-to-DB bypass warning.
 */
export function hasViewToDbBypass(
  nodeId: string,
  warnings: AntiPatternWarning[]
): boolean {
  return warnings.some(
    (w) =>
      w.type === "view-to-db-bypass" &&
      w.nodeId === nodeId
  );
}
