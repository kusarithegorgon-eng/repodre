/**
 * Cyclomatic Complexity Calculator — Structural Code Health Metric
 *
 * Computes cyclomatic complexity using the McCabe formula:
 *   M = E - N + 2P
 * where:
 *   E = number of edges (control flow transitions)
 *   N = number of nodes (basic blocks / statements)
 *   P = number of connected components (functions/modules)
 *
 * For practical source analysis, we approximate using:
 *   M = 1 + (decision points)
 * where decision points = if, else if, for, while, case, catch, &&, ||, ?, switch
 */

export interface ComplexityResult {
  complexity: number;
  level: "low" | "moderate" | "high" | "very-high";
  label: string;
  description: string;
  decisionPoints: number;
  edges: number;
  nodes: number;
  components: number;
  metrics: {
    ifStatements: number;
    elseIfStatements: number;
    forLoops: number;
    whileLoops: number;
    switchCases: number;
    catchBlocks: number;
    ternaryOperators: number;
    logicalAnd: number;
    logicalOr: number;
    nullishCoalescing: number;
  };
}

export function calculateComplexity(source: string): ComplexityResult {
  const metrics = {
    ifStatements: 0,
    elseIfStatements: 0,
    forLoops: 0,
    whileLoops: 0,
    switchCases: 0,
    catchBlocks: 0,
    ternaryOperators: 0,
    logicalAnd: 0,
    logicalOr: 0,
    nullishCoalescing: 0,
  };

  // Remove strings and comments to avoid false positives
  const cleaned = source
    .replace(/\/\/.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--.*$/gm, "")
    .replace(/'([^'\\]|\\.)*'/g, "''")
    .replace(/"([^"\\]|\\.)*"/g, '""')
    .replace(/`([^`\\]|\\.)*`/g, "``");

  // Count decision points
  metrics.ifStatements = (cleaned.match(/\bif\s*\(/g) || []).length;
  metrics.elseIfStatements = (cleaned.match(/\belse\s+if\s*\(/g) || []).length;
  metrics.forLoops = (cleaned.match(/\bfor\s*\(/g) || []).length;
  metrics.whileLoops = (cleaned.match(/\bwhile\s*\(/g) || []).length;
  metrics.switchCases = (cleaned.match(/\bcase\s+/g) || []).length;
  metrics.catchBlocks = (cleaned.match(/\bcatch\s*\(/g) || []).length;
  metrics.ternaryOperators = (cleaned.match(/\?\s*[^:]+\s*:/g) || []).length;
  metrics.logicalAnd = (cleaned.match(/&&/g) || []).length;
  metrics.logicalOr = (cleaned.match(/\|\|/g) || []).length;
  metrics.nullishCoalescing = (cleaned.match(/\?\?/g) || []).length;

  // Subtract else-if from if count (else-if is already counted as if)
  metrics.ifStatements -= metrics.elseIfStatements;

  const decisionPoints =
    metrics.ifStatements +
    metrics.elseIfStatements +
    metrics.forLoops +
    metrics.whileLoops +
    metrics.switchCases +
    metrics.catchBlocks +
    metrics.ternaryOperators +
    metrics.logicalAnd +
    metrics.logicalOr +
    metrics.nullishCoalescing;

  // M = 1 + decision points (simplified McCabe)
  const complexity = 1 + decisionPoints;

  // Approximate E - N + 2P for the formula display
  // For a single function: P=1, N = statements, E = N + decisionPoints
  const components = 1;
  const nodes = Math.max(1, (cleaned.match(/[;{}]/g) || []).length);
  const edges = nodes + decisionPoints;

  let level: ComplexityResult["level"];
  let label: string;
  let description: string;

  if (complexity <= 3) {
    level = "low";
    label = `Complexity: Low (${complexity})`;
    description = "Simple control flow with minimal branching";
  } else if (complexity <= 7) {
    level = "moderate";
    label = `Complexity: Moderate (${complexity})`;
    description = "Moderate branching — review for clarity";
  } else if (complexity <= 12) {
    level = "high";
    label = `Complexity: High Branching Risk (${complexity})`;
    description = "High branching — consider refactoring into smaller functions";
  } else {
    level = "very-high";
    label = `Complexity: Critical (${complexity})`;
    description = "Very high complexity — high risk of defects, refactor recommended";
  }

  return {
    complexity,
    level,
    label,
    description,
    decisionPoints,
    edges,
    nodes,
    components,
    metrics,
  };
}

export function getComplexityColor(level: ComplexityResult["level"]): string {
  switch (level) {
    case "low":
      return "text-green-500";
    case "moderate":
      return "text-yellow-500";
    case "high":
      return "text-orange-500";
    case "very-high":
      return "text-red-500";
  }
}

export function getComplexityBg(level: ComplexityResult["level"]): string {
  switch (level) {
    case "low":
      return "bg-green-500/10 border-green-500/30";
    case "moderate":
      return "bg-yellow-500/10 border-yellow-500/30";
    case "high":
      return "bg-orange-500/10 border-orange-500/30";
    case "very-high":
      return "bg-red-500/10 border-red-500/30";
  }
}

export function calculateComplexityForNode(
  nodeLabel: string,
  nodeSub: string,
  source?: string
): ComplexityResult {
  // If we have source code, analyze it
  if (source) {
    return calculateComplexity(source);
  }

  // Otherwise, estimate based on node type/label heuristics
  const isValidation = nodeSub.toLowerCase().includes("zod") ||
                       nodeSub.toLowerCase().includes("yup") ||
                       nodeSub.toLowerCase().includes("validation") ||
                       nodeSub.toLowerCase().includes("schema");

  const isController = nodeSub.toLowerCase().includes("controller") ||
                      nodeSub.toLowerCase().includes("post") ||
                      nodeSub.toLowerCase().includes("get") ||
                      nodeSub.toLowerCase().includes("put") ||
                      nodeSub.toLowerCase().includes("delete");

  if (isValidation) {
    // Validation schemas typically have moderate complexity
    return {
      complexity: 3,
      level: "low",
      label: "Complexity: Low (3)",
      description: "Validation schema with conditional checks",
      decisionPoints: 2,
      edges: 5,
      nodes: 3,
      components: 1,
      metrics: {
        ifStatements: 2,
        elseIfStatements: 0,
        forLoops: 0,
        whileLoops: 0,
        switchCases: 0,
        catchBlocks: 0,
        ternaryOperators: 0,
        logicalAnd: 0,
        logicalOr: 0,
        nullishCoalescing: 0,
      },
    };
  }

  if (isController) {
    // Controllers typically have moderate-high complexity
    return {
      complexity: 5,
      level: "moderate",
      label: "Complexity: Moderate (5)",
      description: "Controller with branching logic for request handling",
      decisionPoints: 4,
      edges: 8,
      nodes: 4,
      components: 1,
      metrics: {
        ifStatements: 2,
        elseIfStatements: 1,
        forLoops: 0,
        whileLoops: 0,
        switchCases: 0,
        catchBlocks: 1,
        ternaryOperators: 0,
        logicalAnd: 0,
        logicalOr: 0,
        nullishCoalescing: 0,
      },
    };
  }

  // Default: low complexity for simple views/pages
  return {
    complexity: 1,
    level: "low",
    label: "Complexity: Low (1)",
    description: "Simple entry point with no branching",
    decisionPoints: 0,
    edges: 1,
    nodes: 1,
    components: 1,
    metrics: {
      ifStatements: 0,
      elseIfStatements: 0,
      forLoops: 0,
      whileLoops: 0,
      switchCases: 0,
      catchBlocks: 0,
      ternaryOperators: 0,
      logicalAnd: 0,
      logicalOr: 0,
      nullishCoalescing: 0,
    },
  };
}
