/**
 * Git Architecture Diff Engine — Visual PR Diff View
 *
 * Computes differences between canvas states to render visual git-style
 * diff overlays: green for additions, red for deletions, orange for conflicts.
 */

export type DiffStatus = "added" | "modified" | "deleted" | "unchanged" | "conflict";

export interface NodeDiff {
  id: string;
  status: DiffStatus;
  baseNode?: DiffNode;
  headNode?: DiffNode;
  changes: PropertyChange[];
}

export interface PropertyChange {
  property: string;
  oldValue: unknown;
  newValue: unknown;
}

export interface DiffNode {
  id: string;
  label: string;
  sub: string;
  shape: string;
  x: number;
  y: number;
}

export interface DiffResult {
  diffs: NodeDiff[];
  addedCount: number;
  deletedCount: number;
  modifiedCount: number;
  conflictCount: number;
}

export interface EdgeDiff {
  id: string;
  status: DiffStatus;
  baseEdge?: { from: string; to: string };
  headEdge?: { from: string; to: string };
}

/**
 * Computes the diff between two canvas states (base vs head).
 */
export function computeNodeDiff(
  baseNodes: DiffNode[],
  headNodes: DiffNode[]
): DiffResult {
  const diffs: NodeDiff[] = [];
  const baseMap = new Map(baseNodes.map((n) => [n.id, n]));
  const headMap = new Map(headNodes.map((n) => [n.id, n]));
  const allIds = new Set([...baseMap.keys(), ...headMap.keys()]);

  let addedCount = 0;
  let deletedCount = 0;
  let modifiedCount = 0;
  let conflictCount = 0;

  for (const id of allIds) {
    const baseNode = baseMap.get(id);
    const headNode = headMap.get(id);

    if (!baseNode && headNode) {
      // Node added in head
      diffs.push({
        id,
        status: "added",
        headNode,
        changes: [],
      });
      addedCount++;
    } else if (baseNode && !headNode) {
      // Node deleted in head
      diffs.push({
        id,
        status: "deleted",
        baseNode,
        changes: [],
      });
      deletedCount++;
    } else if (baseNode && headNode) {
      // Check for modifications
      const changes: PropertyChange[] = [];

      for (const key of ["label", "sub", "shape", "x", "y"] as const) {
        if (baseNode[key] !== headNode[key]) {
          changes.push({
            property: key,
            oldValue: baseNode[key],
            newValue: headNode[key],
          });
        }
      }

      if (changes.length > 0) {
        // Check for potential conflicts (same ID but different label/shape)
        const hasConflict =
          baseNode.label !== headNode.label &&
          baseNode.shape !== headNode.shape;

        diffs.push({
          id,
          status: hasConflict ? "conflict" : "modified",
          baseNode,
          headNode,
          changes,
        });

        if (hasConflict) {
          conflictCount++;
        } else {
          modifiedCount++;
        }
      } else {
        diffs.push({
          id,
          status: "unchanged",
          baseNode,
          headNode,
          changes: [],
        });
      }
    }
  }

  return {
    diffs,
    addedCount,
    deletedCount,
    modifiedCount,
    conflictCount,
  };
}

/**
 * Computes edge differences between base and head.
 */
export function computeEdgeDiff(
  baseEdges: Array<{ id: string; from: string; to: string }>,
  headEdges: Array<{ id: string; from: string; to: string }>
): EdgeDiff[] {
  const diffs: EdgeDiff[] = [];
  const baseMap = new Map(baseEdges.map((e) => [e.id, e]));
  const headMap = new Map(headEdges.map((e) => [e.id, e]));
  const allIds = new Set([...baseMap.keys(), ...headMap.keys()]);

  for (const id of allIds) {
    const baseEdge = baseMap.get(id);
    const headEdge = headMap.get(id);

    if (!baseEdge && headEdge) {
      diffs.push({ id, status: "added", headEdge });
    } else if (baseEdge && !headEdge) {
      diffs.push({ id, status: "deleted", baseEdge });
    } else if (baseEdge && headEdge) {
      const isModified =
        baseEdge.from !== headEdge.from || baseEdge.to !== headEdge.to;

      diffs.push({
        id,
        status: isModified ? "modified" : "unchanged",
        baseEdge,
        headEdge,
      });
    }
  }

  return diffs;
}

/**
 * Returns CSS classes for diff status styling.
 */
export function getDiffStatusClasses(status: DiffStatus): {
  border: string;
  background: string;
  text: string;
  badge: string;
} {
  switch (status) {
    case "added":
      return {
        border: "border-green-500",
        background: "bg-green-500/10",
        text: "text-green-500",
        badge: "bg-green-500 text-white",
      };
    case "deleted":
      return {
        border: "border-red-500",
        background: "bg-red-500/10",
        text: "text-red-500",
        badge: "bg-red-500 text-white",
      };
    case "modified":
      return {
        border: "border-blue-500",
        background: "bg-blue-500/10",
        text: "text-blue-500",
        badge: "bg-blue-500 text-white",
      };
    case "conflict":
      return {
        border: "border-orange-500",
        background: "bg-orange-500/10",
        text: "text-orange-500",
        badge: "bg-orange-500 text-white",
      };
    default:
      return {
        border: "border-border",
        background: "bg-transparent",
        text: "text-foreground",
        badge: "bg-muted text-muted-foreground",
      };
  }
}

/**
 * Generates a mock PR diff for demonstration.
 */
export function generateMockPrDiff(
  currentNodes: DiffNode[]
): DiffResult {
  // Simulate a PR with some changes
  const headNodes: DiffNode[] = [...currentNodes];

  // Modify one node
  if (headNodes.length > 0) {
    const modifiedIdx = Math.floor(Math.random() * headNodes.length);
    headNodes[modifiedIdx] = {
      ...headNodes[modifiedIdx],
      label: headNodes[modifiedIdx].label + " (v2)",
    };
  }

  // Add a new node
  const newId = `diff_new_${Date.now()}`;
  headNodes.push({
    id: newId,
    label: "/new-endpoint",
    sub: "View · Added",
    shape: "pill",
    x: 60 + (headNodes.length % 4) * 280,
    y: 80 + Math.floor(headNodes.length / 4) * 160,
  });

  return computeNodeDiff(currentNodes, headNodes);
}

/**
 * Gets the diff status for a specific node ID.
 */
export function getNodeDiffStatus(
  nodeId: string,
  diffResult: DiffResult | null
): DiffStatus {
  if (!diffResult) return "unchanged";
  const diff = diffResult.diffs.find((d) => d.id === nodeId);
  return diff?.status || "unchanged";
}
