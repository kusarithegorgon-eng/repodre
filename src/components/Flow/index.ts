/**
 * Flow Components — App Journey Architecture
 *
 * Components for building execution flow diagrams with proper
 * architectural layering: UI → Controller → Database.
 */

export {
  isControllerNode,
  classifyNodeLayer,
  type ArchitecturalLayer,
} from "./node-classifier";

export {
  ControllerNode,
  ControllerBadge,
  withControllerBadge,
  createControllerNode,
  linkUiToController,
  linkControllerToDatabase,
  linkUiThroughControllerToDatabase,
  validateConnection,
  findAntiPatternWarnings,
  SecurityWarningBadge,
  LinkButton,
  type ControllerNodeData,
  type FlowNode,
  type FlowEdge,
  type ValidationResult,
} from "./ControllerNode";

export {
  generateSmartLinks,
  findDirectUiToDbConnections,
  generateControllerIntermediary,
  computeSmartLinkPaths,
  useSmartLinks,
  getSmartLinkClasses,
  type SmartLinkEdge,
  type SmartLinkConfig,
} from "./smart-link";
