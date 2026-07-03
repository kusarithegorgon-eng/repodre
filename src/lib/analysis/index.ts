/**
 * Analysis Engine Module
 *
 * Exports the automated analysis engine, persistence layer,
 * and related types for repository analysis.
 */

export {
  AutomatedAnalysisEngine,
  automatedAnalysisEngine,
  type AnalysisNode,
  type AnalysisEdge,
  type AnalysisGraph,
  type AnalysisResult,
  type AnalysisOptions,
  type AnalysisMetadata,
  type ProgressCallback,
  type AnalysisPhase,
} from "./automated-analysis-engine";

export {
  persistAnalysisGraph,
  loadPersistedGraph,
  deletePersistedProject,
  type PersistedProject,
  type PersistedNode,
  type PersistedEdge,
  type PersistenceResult,
} from "./persistence";
