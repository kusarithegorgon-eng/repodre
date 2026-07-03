/**
 * Flow Tracer - Execution Path Visualization
 *
 * Traces execution paths through the dependency graph, allowing users
 * to select a file/function and see the complete flow from entry to exit.
 */

import type { AnalysisNode, AnalysisEdge, AnalysisGraph } from "../analysis/automated-analysis-engine";
import type { ParsedModule } from "../parsers";

export interface FlowPath {
  /** Nodes in execution order */
  nodes: FlowNode[];
  /** Edges connecting the path */
  edges: FlowEdge[];
  /** Path metadata */
  metadata: FlowMetadata;
}

export interface FlowNode extends AnalysisNode {
  /** Position in the execution sequence */
  order: number;
  /** Whether this node is the selected entry point */
  isEntry: boolean;
  /** Whether this node is a terminal/exit point */
  isExit: boolean;
  /** Branch condition if this is a conditional path */
  branchCondition?: string;
}

export interface FlowEdge extends AnalysisEdge {
  /** Whether this edge was inferred */
  inferred: boolean;
  /** Confidence score (0-1) */
  confidence: number;
}

export interface FlowMetadata {
  entryNode: string;
  exitNodes: string[];
  totalSteps: number;
  hasCycles: boolean;
  maxDepth: number;
}

export interface TraceOptions {
  /** Direction to trace: forward, backward, or both */
  direction: "forward" | "backward" | "both";
  /** Maximum depth to trace */
  maxDepth: number;
  /** Include only specific node types */
  nodeTypes?: AnalysisNode["type"][];
  /** Follow async flows */
  followAsync?: boolean;
  /** Include error paths */
  includeErrors?: boolean;
}

const DEFAULT_TRACE_OPTIONS: TraceOptions = {
  direction: "both",
  maxDepth: 50,
  followAsync: true,
  includeErrors: false,
};

/**
 * Flow Tracer - traces execution paths through a dependency graph.
 */
export class FlowTracer {
  private graph: AnalysisGraph;
  private nodeIdToNode: Map<string, AnalysisNode>;
  private adjForward: Map<string, string[]>;
  private adjBackward: Map<string, string[]>;

  constructor(graph: AnalysisGraph) {
    this.graph = graph;
    this.nodeIdToNode = new Map(graph.nodes.map((n) => [n.id, n]));

    // Build adjacency lists
    this.adjForward = new Map();
    this.adjBackward = new Map();

    for (const edge of graph.edges) {
      if (!this.adjForward.has(edge.from)) this.adjForward.set(edge.from, []);
      if (!this.adjBackward.has(edge.to)) this.adjBackward.set(edge.to, []);
      this.adjForward.get(edge.from)!.push(edge.to);
      this.adjBackward.get(edge.to)!.push(edge.from);
    }
  }

  /**
   * Trace execution paths from a starting node.
   */
  trace(nodeId: string, options: Partial<TraceOptions> = {}): FlowPath {
    const opts = { ...DEFAULT_TRACE_OPTIONS, ...options };
    const nodes: FlowNode[] = [];
    const edges: FlowEdge[] = [];
    const visited = new Set<string>();
    const exitNodes: string[] = [];

    let order = 0;
    let maxDepth = 0;

    const traceDFS = (
      currentId: string,
      depth: number,
      direction: "forward" | "backward"
    ): void => {
      if (depth > opts.maxDepth) return;
      if (visited.has(currentId) && direction === "forward") return;
      visited.add(currentId);

      maxDepth = Math.max(maxDepth, depth);

      const node = this.nodeIdToNode.get(currentId);
      if (!node) return;

      // Filter by node type
      if (opts.nodeTypes && !opts.nodeTypes.includes(node.type)) return;

      // Add node to path
      const flowNode: FlowNode = {
        ...node,
        order: order++,
        isEntry: currentId === nodeId,
        isExit: false,
      };
      nodes.push(flowNode);

      // Get adjacent nodes based on direction
      const nextIds = direction === "backward"
        ? (this.adjBackward.get(currentId) ?? [])
        : (this.adjForward.get(currentId) ?? []);

      if (nextIds.length === 0) {
        // This is an exit node
        exitNodes.push(currentId);
        flowNode.isExit = true;
      }

      // Continue tracing
      for (const nextId of nextIds) {
        const edge = this.graph.edges.find(
          (e) =>
            (direction === "forward" && e.from === currentId && e.to === nextId) ||
            (direction === "backward" && e.to === currentId && e.from === nextId)
        );

        if (edge) {
          edges.push({
            ...edge,
            id: `flow_${edge.id}`,
            inferred: false,
            confidence: 1,
          });
        }

        traceDFS(nextId, depth + 1, direction);
      }
    };

    // Trace from entry point
    if (opts.direction === "forward" || opts.direction === "both") {
      visited.clear();
      traceDFS(nodeId, 0, "forward");
    }

    if (opts.direction === "backward" || opts.direction === "both") {
      // Reverse order for backward trace
      visited.clear();
      order = 0;
      traceDFS(nodeId, 0, "backward");
    }

    // Sort by order
    nodes.sort((a, b) => a.order - b.order);

    const metadata: FlowMetadata = {
      entryNode: nodeId,
      exitNodes,
      totalSteps: nodes.length,
      hasCycles: this.detectCycle(nodeId),
      maxDepth,
    };

    return { nodes, edges, metadata };
  }

  /**
   * Find all paths between two nodes.
   */
  findPaths(fromId: string, toId: string, maxPaths = 10): FlowPath[] {
    const paths: FlowPath[] = [];
    const visited = new Set<string>();

    const findDFS = (current: string, path: string[], edgePath: string[]): boolean => {
      if (paths.length >= maxPaths) return true;
      if (visited.has(current)) return false;
      visited.add(current);

      path.push(current);

      if (current === toId) {
        // Found a path
        const pathNodes = path.map((id, i) => {
          const node = this.nodeIdToNode.get(id)!;
          return {
            ...node,
            order: i,
            isEntry: id === fromId,
            isExit: id === toId,
          } as FlowNode;
        });

        const pathEdges = edgePath.map((eid, i) => {
          const edge = this.graph.edges.find((e) => e.id === eid)!;
          return { ...edge, inferred: false, confidence: 1 } as FlowEdge;
        });

        paths.push({
          nodes: pathNodes,
          edges: pathEdges,
          metadata: {
            entryNode: fromId,
            exitNodes: [toId],
            totalSteps: path.length,
            hasCycles: false,
            maxDepth: path.length,
          },
        });

        path.pop();
        visited.delete(current);
        return false;
      }

      const nextIds = this.adjForward.get(current) ?? [];
      for (const nextId of nextIds) {
        const edge = this.graph.edges.find((e) => e.from === current && e.to === nextId);
        if (edge) {
          edgePath.push(edge.id);
          if (findDFS(nextId, path, edgePath)) return true;
          edgePath.pop();
        }
      }

      path.pop();
      visited.delete(current);
      return false;
    };

    findDFS(fromId, [], []);

    return paths;
  }

  /**
   * Get all entry points (nodes with no incoming edges).
   */
  getEntryPoints(): AnalysisNode[] {
    const hasIncoming = new Set(this.graph.edges.map((e) => e.to));
    return this.graph.nodes.filter((n) => !hasIncoming.has(n.id));
  }

  /**
   * Get all exit points (nodes with no outgoing edges).
   */
  getExitPoints(): AnalysisNode[] {
    const hasOutgoing = new Set(this.graph.edges.map((e) => e.from));
    return this.graph.nodes.filter((n) => !hasOutgoing.has(n.id));
  }

  /**
   * Detect if a cycle exists reachable from a node.
   */
  private detectCycle(startId: string): boolean {
    const visited = new Set<string>();
    const recStack = new Set<string>();

    const dfs = (id: string): boolean => {
      visited.add(id);
      recStack.add(id);

      for (const next of this.adjForward.get(id) ?? []) {
        if (!visited.has(next)) {
          if (dfs(next)) return true;
        } else if (recStack.has(next)) {
          return true;
        }
      }

      recStack.delete(id);
      return false;
    };

    return dfs(startId);
  }
}

/**
 * Create a FlowTracer from an AnalysisGraph.
 */
export function createFlowTracer(graph: AnalysisGraph): FlowTracer {
  return new FlowTracer(graph);
}
