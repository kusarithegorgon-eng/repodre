/**
 * Flow Analysis Module
 *
 * Exports flow tracing and architectural validation tools
 * for execution path visualization and code quality checks.
 */

export {
  FlowTracer,
  createFlowTracer,
  type FlowPath,
  type FlowNode,
  type FlowEdge,
  type FlowMetadata,
  type TraceOptions,
} from "./flow-tracer";

export {
  ArchitecturalValidator,
  createValidator,
  validateGraph,
  type ValidationIssue,
  type IssueKind,
  type ValidationResult,
  type ValidationStats,
  type ValidationOptions,
} from "./architectural-validator";
