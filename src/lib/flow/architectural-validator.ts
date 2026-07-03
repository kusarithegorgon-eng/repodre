/**
 * Architectural Validator - Detects code quality and security issues.
 *
 * Validates the dependency graph for:
 * - Circular dependencies
 * - Missing authentication/authorization checks in sensitive paths
 * - Unused exports
 * - Deeply nested call chains
 * - Missing error handling
 */

import type { AnalysisGraph, AnalysisNode, AnalysisEdge } from "../analysis/automated-analysis-engine";
import type { ParsedModule } from "../parsers";

export interface ValidationIssue {
  id: string;
  severity: "error" | "warning" | "info";
  kind: IssueKind;
  message: string;
  nodes: string[];
  edges?: string[];
  suggestion?: string;
  location?: { file: string; line?: number };
}

export type IssueKind =
  | "circular-dependency"
  | "missing-auth"
  | "missing-auth-check"
  | "unused-export"
  | "deep-call-chain"
  | "missing-error-handling"
  | "async-in-sync"
  | "missing-validation"
  | "sensitive-data-exposure"
  | "unreachable-code";

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  stats: ValidationStats;
}

export interface ValidationStats {
  totalIssues: number;
  errors: number;
  warnings: number;
  info: number;
  circularDependencies: number;
  missingAuthChecks: number;
  unusedExports: number;
  deepCallChains: number;
}

export interface ValidationOptions {
  /** Maximum allowed call chain depth */
  maxCallDepth: number;
  /** Patterns for sensitive endpoints requiring auth */
  sensitivePatterns: RegExp[];
  /** Patterns for files to skip */
  excludePatterns: RegExp[];
  /** Check for unused exports */
  checkUnusedExports: boolean;
  /** Check for missing validation before API calls */
  checkMissingValidation: boolean;
}

const DEFAULT_OPTIONS: ValidationOptions = {
  maxCallDepth: 10,
  sensitivePatterns: [
    /\/api\/(user|auth|account|payment|admin)/i,
    /\/(login|logout|register|settings|profile)/i,
  ],
  excludePatterns: [/node_modules/, /\.test\./, /\.spec\./],
  checkUnusedExports: true,
  checkMissingValidation: true,
};

let issueIdCounter = 0;

function nextIssueId(): string {
  return `issue_${++issueIdCounter}`;
}

/**
 * Architectural Validator - validates dependency graphs for issues.
 */
export class ArchitecturalValidator {
  private graph: AnalysisGraph;
  private options: ValidationOptions;
  private nodeIdToNode: Map<string, AnalysisNode>;

  constructor(graph: AnalysisGraph, options: Partial<ValidationOptions> = {}) {
    this.graph = graph;
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.nodeIdToNode = new Map(graph.nodes.map((n) => [n.id, n]));
  }

  /**
   * Run all validations and return the result.
   */
  validate(): ValidationResult {
    const issues: ValidationIssue[] = [];

    issues.push(...this.detectCircularDependencies());
    issues.push(...this.detectMissingAuthChecks());
    issues.push(...this.detectDeepCallChains());

    if (this.options.checkUnusedExports) {
      issues.push(...this.detectUnusedExports());
    }

    if (this.options.checkMissingValidation) {
      issues.push(...this.detectMissingValidation());
    }

    const stats = this.computeStats(issues);

    return {
      valid: issues.filter((i) => i.severity === "error").length === 0,
      issues,
      stats,
    };
  }

  /**
   * Detect circular dependencies in the graph.
   */
  detectCircularDependencies(): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const adj = new Map<string, string[]>();

    for (const edge of this.graph.edges) {
      if (!adj.has(edge.from)) adj.set(edge.from, []);
      adj.get(edge.from)!.push(edge.to);
    }

    const visited = new Set<string>();
    const recStack = new Set<string>();
    const cycles: string[][] = [];

    const dfs = (node: string, path: string[]): boolean => {
      visited.add(node);
      recStack.add(node);
      path.push(node);

      for (const neighbor of adj.get(node) ?? []) {
        if (!visited.has(neighbor)) {
          if (dfs(neighbor, path)) return true;
        } else if (recStack.has(neighbor)) {
          // Found cycle
          const cycleStart = path.indexOf(neighbor);
          cycles.push([...path.slice(cycleStart), neighbor]);
        }
      }

      path.pop();
      recStack.delete(node);
      return false;
    };

    for (const node of this.graph.nodes) {
      if (!visited.has(node.id)) {
        dfs(node.id, []);
      }
    }

    // Create issues for unique cycles
    const seenCycles = new Set<string>();
    for (const cycle of cycles) {
      const normalized = [...cycle].sort().join("->");
      if (seenCycles.has(normalized)) continue;
      seenCycles.add(normalized);

      issues.push({
        id: nextIssueId(),
        severity: "error",
        kind: "circular-dependency",
        message: `Circular dependency detected: ${cycle.map((id) => this.nodeIdToNode.get(id)?.label ?? id).join(" → ")}`,
        nodes: cycle.slice(0, -1),
        suggestion: "Consider breaking the cycle by extracting shared logic to a separate module.",
      });
    }

    return issues;
  }

  /**
   * Detect sensitive endpoints missing authentication checks.
   */
  detectMissingAuthChecks(): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const { sensitivePatterns } = this.options;

    for (const node of this.graph.nodes) {
      // Check if node is a sensitive route or API
      const isSensitive = sensitivePatterns.some((p) => p.test(node.label) || p.test(node.sourcePath ?? ""));

      if (!isSensitive) continue;

      // Check if there's an auth check in the incoming path
      const hasAuthCheck = this.hasIncomingAuthCheck(node.id);

      if (!hasAuthCheck) {
        issues.push({
          id: nextIssueId(),
          severity: "warning",
          kind: "missing-auth-check",
          message: `Sensitive endpoint "${node.label}" may be missing authentication/authorization check.`,
          nodes: [node.id],
          suggestion: "Add authentication middleware or session check before accessing sensitive data.",
          location: node.sourcePath ? { file: node.sourcePath, line: node.line } : undefined,
        });
      }
    }

    return issues;
  }

  /**
   * Check if a node has an auth check in its incoming path.
   */
  private hasIncomingAuthCheck(nodeId: string): boolean {
    const visited = new Set<string>();
    const authPatterns = [
      /auth/i,
      /session/i,
      /token/i,
      /authenticated/i,
      /authorized/i,
      /middleware/i,
      /requireAuth/i,
    ];

    const checkDFS = (currentId: string, depth: number): boolean => {
      if (depth > 5) return false;
      if (visited.has(currentId)) return false;
      visited.add(currentId);

      const node = this.nodeIdToNode.get(currentId);
      if (node) {
        const label = node.label.toLowerCase();
        if (authPatterns.some((p) => p.test(label))) {
          return true;
        }
      }

      // Check incoming edges
      for (const edge of this.graph.edges) {
        if (edge.to === currentId) {
          if (checkDFS(edge.from, depth + 1)) return true;
        }
      }

      return false;
    };

    return checkDFS(nodeId, 0);
  }

  /**
   * Detect deeply nested call chains.
   */
  detectDeepCallChains(): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const adj = new Map<string, string[]>();

    for (const edge of this.graph.edges) {
      if (edge.kind === "call" || edge.kind === "reference") {
        if (!adj.has(edge.from)) adj.set(edge.from, []);
        adj.get(edge.from)!.push(edge.to);
      }
    }

    const depth = new Map<string, number>();
    const visited = new Set<string>();

    const computeDepth = (nodeId: string): number => {
      if (depth.has(nodeId)) return depth.get(nodeId)!;
      if (visited.has(nodeId)) return 0; // Cycle

      visited.add(nodeId);
      let maxChild = 0;

      for (const child of adj.get(nodeId) ?? []) {
        maxChild = Math.max(maxChild, computeDepth(child) + 1);
      }

      depth.set(nodeId, maxChild);
      return maxChild;
    };

    for (const node of this.graph.nodes) {
      if (!depth.has(node.id)) {
        computeDepth(node.id);
      }
    }

    // Find nodes exceeding max depth
    for (const [nodeId, nodeDepth] of depth) {
      if (nodeDepth > this.options.maxCallDepth) {
        const node = this.nodeIdToNode.get(nodeId);
        issues.push({
          id: nextIssueId(),
          severity: "warning",
          kind: "deep-call-chain",
          message: `Call chain depth of ${nodeDepth} exceeds recommended maximum of ${this.options.maxCallDepth}`,
          nodes: [nodeId],
          suggestion: "Consider refactoring to reduce coupling and call chain depth.",
          location: node?.sourcePath ? { file: node.sourcePath, line: node?.line } : undefined,
        });
      }
    }

    return issues;
  }

  /**
   * Detect exported symbols that are never imported.
   */
  detectUnusedExports(): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    // Find all imports
    const importedSymbols = new Set<string>();
    for (const node of this.graph.nodes) {
      if (node.type === "import") {
        importedSymbols.add(node.label);
      }
    }

    // Check for exports without corresponding imports
    for (const node of this.graph.nodes) {
      if (node.type === "function" || node.type === "class") {
        const isExported = node.metadata?.exported === true;
        if (isExported && !importedSymbols.has(node.label)) {
          // Check if it's a route handler or API endpoint (these are entry points)
          const isEntryPoint = this.graph.nodes.some(
            (n) => n.type === "route" || n.type === "api"
          );

          if (!isEntryPoint) {
            issues.push({
              id: nextIssueId(),
              severity: "info",
              kind: "unused-export",
              message: `Exported symbol "${node.label}" may not be imported anywhere.`,
              nodes: [node.id],
              suggestion: "Consider removing unused exports or document why they're needed.",
            });
          }
        }
      }
    }

    return issues;
  }

  /**
   * Detect API calls that don't have preceding validation.
   */
  detectMissingValidation(): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const validationPatterns = [/validate/i, /schema/i, /check/i, /verify/i, /guard/i];

    for (const node of this.graph.nodes) {
      if (node.type !== "api") continue;

      // Check if there's a validation node in the incoming path
      const hasValidation = this.hasIncomingValidation(node.id, validationPatterns);

      if (!hasValidation) {
        issues.push({
          id: nextIssueId(),
          severity: "info",
          kind: "missing-validation",
          message: `API endpoint "${node.label}" may be missing input validation.`,
          nodes: [node.id],
          suggestion: "Add Zod/Yup/Joi schema validation before processing API requests.",
        });
      }
    }

    return issues;
  }

  /**
   * Check if a node has validation in its incoming path.
   */
  private hasIncomingValidation(nodeId: string, patterns: RegExp[]): boolean {
    const visited = new Set<string>();

    const checkDFS = (currentId: string, depth: number): boolean => {
      if (depth > 5) return false;
      if (visited.has(currentId)) return false;
      visited.add(currentId);

      const node = this.nodeIdToNode.get(currentId);
      if (node) {
        const label = node.label;
        if (patterns.some((p) => p.test(label))) {
          return true;
        }
      }

      for (const edge of this.graph.edges) {
        if (edge.to === currentId) {
          if (checkDFS(edge.from, depth + 1)) return true;
        }
      }

      return false;
    };

    return checkDFS(nodeId, 0);
  }

  /**
   * Compute validation statistics.
   */
  private computeStats(issues: ValidationIssue[]): ValidationStats {
    return {
      totalIssues: issues.length,
      errors: issues.filter((i) => i.severity === "error").length,
      warnings: issues.filter((i) => i.severity === "warning").length,
      info: issues.filter((i) => i.severity === "info").length,
      circularDependencies: issues.filter((i) => i.kind === "circular-dependency").length,
      missingAuthChecks: issues.filter((i) => i.kind === "missing-auth-check").length,
      unusedExports: issues.filter((i) => i.kind === "unused-export").length,
      deepCallChains: issues.filter((i) => i.kind === "deep-call-chain").length,
    };
  }
}

/**
 * Create an ArchitecturalValidator from an AnalysisGraph.
 */
export function createValidator(
  graph: AnalysisGraph,
  options?: Partial<ValidationOptions>
): ArchitecturalValidator {
  return new ArchitecturalValidator(graph, options);
}

/**
 * Quick validation function.
 */
export function validateGraph(
  graph: AnalysisGraph,
  options?: Partial<ValidationOptions>
): ValidationResult {
  const validator = new ArchitecturalValidator(graph, options);
  return validator.validate();
}
