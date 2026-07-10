/**
 * Modular Link-Layer — Spatial Connector System
 *
 * Provides:
 *   - Execution Context Stack tracking during parsing
 *   - Spatial Connector node injection for module transitions
 *   - Transition detection between modules/directories/functions
 *   - Interactive highlight filtering for path navigation
 */

import type { JourneyNode, JourneyEdge } from "./journey-flow-builder";

export interface ExecutionContextFrame {
  /** Unique identifier for this context frame */
  id: string;
  /** Type of module or boundary */
  kind: "directory" | "function" | "module" | "service" | "layer";
  /** Human-readable name (e.g., "app/auth", "handleLogin") */
  name: string;
  /** File path this context represents */
  path?: string;
  /** Parent frame ID (for stack navigation) */
  parentId?: string;
  /** Depth in the stack */
  depth: number;
}

export interface TransitionPoint {
  /** Unique transition ID */
  transitionId: string;
  /** Source context being exited */
  fromContext: ExecutionContextFrame;
  /** Target context being entered */
  toContext: ExecutionContextFrame;
  /** The file/line where transition occurs */
  sourcePath?: string;
  line?: number;
}

export interface SpatialConnector {
  id: string;
  /** Transition this connector represents */
  transitionId: string;
  /** exitID for connectors leaving a module */
  exitId: string;
  /** entryID for connectors entering a module */
  entryId: string;
  /** Whether this is an exit or entry connector */
  isExit: boolean;
  /** Visual position */
  x: number;
  y: number;
  /** Paired connector ID (exit links to entry) */
  pairedConnectorId?: string;
}

export interface ConnectorPair {
  exitConnector: SpatialConnector;
  entryConnector: SpatialConnector;
  transition: TransitionPoint;
}

export interface ModulePath {
  /** Ordered list of module names (breadcrumb trail) */
  modules: string[];
  /** Active transition ID if hovering a connector */
  activeTransitionId?: string;
  /** Highlighted node IDs in the current path */
  highlightedNodeIds: Set<string>;
}

/**
 * Execution Context Stack Manager
 * Tracks the current parsing context as modules are traversed.
 */
export class ExecutionContextStack {
  private stack: ExecutionContextFrame[] = [];
  private frameCounter = 0;

  /** Current depth of the stack */
  get depth(): number {
    return this.stack.length;
  }

  /** Current (top) context frame */
  get current(): ExecutionContextFrame | undefined {
    return this.stack[this.stack.length - 1];
  }

  /** All frames in the stack (bottom to top) */
  get frames(): ExecutionContextFrame[] {
    return [...this.stack];
  }

  /** Push a new context onto the stack */
  push(kind: ExecutionContextFrame["kind"], name: string, path?: string): ExecutionContextFrame {
    const parent = this.current;
    const frame: ExecutionContextFrame = {
      id: `ctx_${++this.frameCounter}`,
      kind,
      name,
      path,
      parentId: parent?.id,
      depth: this.stack.length,
    };
    this.stack.push(frame);
    return frame;
  }

  /** Pop the top context from the stack */
  pop(): ExecutionContextFrame | undefined {
    return this.stack.pop();
  }

  /** Check if entering a new module (directory/function boundary) */
  isEnteringModule(newPath: string): boolean {
    if (!this.current?.path) return true;
    const currentDir = this.current.path.split("/").slice(0, -1).join("/");
    const newDir = newPath.split("/").slice(0, -1).join("/");
    return currentDir !== newDir;
  }

  /** Check if exiting a module */
  isExitingModule(newPath: string): boolean {
    if (!this.current?.path) return false;
    const currentDir = this.current.path.split("/").slice(0, -1).join("/");
    const newDir = newPath.split("/").slice(0, -1).join("/");
    return currentDir !== newDir && newDir.startsWith(currentDir);
  }

  /** Detect transition between two paths */
  detectTransition(fromPath: string, toPath: string): TransitionPoint | null {
    const fromDir = fromPath.split("/").slice(0, -1).join("/");
    const toDir = toPath.split("/").slice(0, -1).join("/");

    if (fromDir === toDir) return null;

    return {
      transitionId: `trans_${++this.frameCounter}`,
      fromContext: {
        id: `ctx_${this.frameCounter}_exit`,
        kind: "directory",
        name: fromDir.split("/").pop() || fromDir,
        path: fromPath,
        depth: fromDir.split("/").length,
      },
      toContext: {
        id: `ctx_${this.frameCounter}_entry`,
        kind: "directory",
        name: toDir.split("/").pop() || toDir,
        path: toPath,
        depth: toDir.split("/").length,
      },
      sourcePath: fromPath,
    };
  }

  /** Reset the stack */
  reset(): void {
    this.stack = [];
    this.frameCounter = 0;
  }
}

/**
 * Connector Registry
 * Manages spatial connectors and their pairings.
 */
export class ConnectorRegistry {
  private connectors = new Map<string, SpatialConnector>();
  private transitions = new Map<string, TransitionPoint>();
  private pairs = new Map<string, ConnectorPair>();
  private connectorCounter = 0;

  /** Register a transition point */
  registerTransition(transition: TransitionPoint): void {
    this.transitions.set(transition.transitionId, transition);
  }

  /** Inject connector pairs for a transition */
  injectConnectors(
    transition: TransitionPoint
  ): ConnectorPair {
    const exitId = `conn_exit_${++this.connectorCounter}`;
    const entryId = `conn_entry_${this.connectorCounter}`;

    const exitConnector: SpatialConnector = {
      id: exitId,
      transitionId: transition.transitionId,
      exitId,
      entryId: `${entryId}_ref`,
      isExit: true,
      x: 0,
      y: 0,
      pairedConnectorId: entryId,
    };

    const entryConnector: SpatialConnector = {
      id: entryId,
      transitionId: transition.transitionId,
      exitId: `${exitId}_ref`,
      entryId,
      isExit: false,
      x: 0,
      y: 0,
      pairedConnectorId: exitId,
    };

    this.connectors.set(exitId, exitConnector);
    this.connectors.set(entryId, entryConnector);

    const pair: ConnectorPair = {
      exitConnector,
      entryConnector,
      transition,
    };

    this.pairs.set(transition.transitionId, pair);
    return pair;
  }

  /** Get connector by ID */
  getConnector(id: string): SpatialConnector | undefined {
    return this.connectors.get(id);
  }

  /** Get all connectors */
  getAllConnectors(): SpatialConnector[] {
    return Array.from(this.connectors.values());
  }

  /** Get transition by ID */
  getTransition(id: string): TransitionPoint | undefined {
    return this.transitions.get(id);
  }

  /** Get connector pair for a transition */
  getPair(transitionId: string): ConnectorPair | undefined {
    return this.pairs.get(transitionId);
  }

  /** Find connectors for a module path */
  findConnectorsForModule(moduleName: string): SpatialConnector[] {
    return this.getAllConnectors().filter(c => {
      const trans = this.transitions.get(c.transitionId);
      if (!trans) return false;
      return trans.fromContext.name === moduleName || trans.toContext.name === moduleName;
    });
  }

  /** Update connector positions */
  updateConnectorPositions(positions: Map<string, { x: number; y: number }>): void {
    for (const [id, pos] of positions) {
      const connector = this.connectors.get(id);
      if (connector) {
        connector.x = pos.x;
        connector.y = pos.y;
      }
    }
  }
}

/**
 * Path Highlighter
 * Filters nodes and edges based on active transition.
 */
export class PathHighlighter {
  private activeTransitionId: string | null = null;
  private highlightedNodeIds = new Set<string>();
  private highlightedEdgeIds = new Set<string>();

  /** Set active transition for highlighting */
  setActiveTransition(
    transitionId: string | null,
    nodes: JourneyNode[],
    edges: JourneyEdge[],
    connectorRegistry: ConnectorRegistry
  ): void {
    this.activeTransitionId = transitionId;
    this.highlightedNodeIds.clear();
    this.highlightedEdgeIds.clear();

    if (!transitionId) return;

    const pair = connectorRegistry.getPair(transitionId);
    if (!pair) return;

    const transition = pair.transition;

    // Find nodes in the from and to modules
    for (const node of nodes) {
      const sourcePath = node.sourcePath;
      if (!sourcePath) continue;

      const fromDir = transition.fromContext.path?.split("/").slice(0, -1).join("/") ?? "";
      const toDir = transition.toContext.path?.split("/").slice(0, -1).join("/") ?? "";

      if (sourcePath.startsWith(fromDir) || sourcePath.startsWith(toDir)) {
        this.highlightedNodeIds.add(node.id);
      }
    }

    // Include connector nodes
    this.highlightedNodeIds.add(pair.exitConnector.id);
    this.highlightedNodeIds.add(pair.entryConnector.id);

    // Find edges connecting highlighted nodes
    for (const edge of edges) {
      if (
        this.highlightedNodeIds.has(edge.from) &&
        this.highlightedNodeIds.has(edge.to)
      ) {
        this.highlightedEdgeIds.add(edge.id);
      }
    }
  }

  /** Check if a node is highlighted */
  isNodeHighlighted(nodeId: string): boolean {
    if (!this.activeTransitionId) return true;
    return this.highlightedNodeIds.has(nodeId);
  }

  /** Check if an edge is highlighted */
  isEdgeHighlighted(edgeId: string): boolean {
    if (!this.activeTransitionId) return true;
    return this.highlightedEdgeIds.has(edgeId);
  }

  /** Get highlighted node IDs */
  getHighlightedNodeIds(): Set<string> {
    return new Set(this.highlightedNodeIds);
  }

  /** Get dimmed node IDs (inverse of highlighted) */
  getDimmedNodeIds(allNodeIds: string[]): Set<string> {
    if (!this.activeTransitionId) return new Set();
    return new Set(allNodeIds.filter(id => !this.highlightedNodeIds.has(id)));
  }

  /** Compute opacity for a node */
  getNodeOpacity(nodeId: string): number {
    return this.isNodeHighlighted(nodeId) ? 1 : 0.25;
  }

  /** Compute opacity for an edge */
  getEdgeOpacity(edgeId: string): number {
    return this.isEdgeHighlighted(edgeId) ? 1 : 0.15;
  }
}

/**
 * Breadcrumb Builder
 * Constructs the module path for the breadcrumb UI.
 */
export class BreadcrumbBuilder {
  /** Build breadcrumb path from nodes and registry */
  buildPath(
    nodes: JourneyNode[],
    activeTransitionId: string | null,
    connectorRegistry: ConnectorRegistry
  ): ModulePath {
    const modules: string[] = [];
    const highlightedNodeIds = new Set<string>();

    if (!activeTransitionId) {
      // No active transition - show root level
      return { modules: ["App"], highlightedNodeIds: new Set(nodes.map(n => n.id)) };
    }

    const pair = connectorRegistry.getPair(activeTransitionId);
    if (!pair) {
      return { modules: ["App"], highlightedNodeIds: new Set() };
    }

    const trans = pair.transition;

    // Build module path: App > fromModule > toModule
    modules.push("App");
    modules.push(trans.fromContext.name);
    modules.push(trans.toContext.name);

    // Find nodes in the highlighted path
    for (const node of nodes) {
      const sourcePath = node.sourcePath;
      if (!sourcePath) continue;

      const fromDir = trans.fromContext.path?.split("/").slice(0, -1).join("/") ?? "";
      const toDir = trans.toContext.path?.split("/").slice(0, -1).join("/") ?? "";

      if (sourcePath.startsWith(fromDir) || sourcePath.startsWith(toDir)) {
        highlightedNodeIds.add(node.id);
      }
    }

    // Include connector nodes
    highlightedNodeIds.add(pair.exitConnector.id);
    highlightedNodeIds.add(pair.entryConnector.id);

    return {
      modules,
      activeTransitionId,
      highlightedNodeIds,
    };
  }

  /** Format breadcrumb as string */
  formatBreadcrumb(path: ModulePath): string {
    return path.modules.join(" > ");
  }
}

/**
 * Create default instances
 */
export function createExecutionContextStack(): ExecutionContextStack {
  return new ExecutionContextStack();
}

export function createConnectorRegistry(): ConnectorRegistry {
  return new ConnectorRegistry();
}

export function createPathHighlighter(): PathHighlighter {
  return new PathHighlighter();
}

export function createBreadcrumbBuilder(): BreadcrumbBuilder {
  return new BreadcrumbBuilder();
}
