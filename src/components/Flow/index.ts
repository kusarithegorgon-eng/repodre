/**
 * Flow Components — App Journey Architecture
 *
 * Components for building execution flow diagrams with proper
 * architectural layering: UI → Controller → Database.
 */

export {
  ControllerNode,
  ControllerBadge,
  withControllerBadge,
  isControllerNode,
  classifyNodeLayer,
  createControllerNode,
  linkUiToController,
  linkControllerToDatabase,
  linkUiThroughControllerToDatabase,
  validateConnection,
  findAntiPatternWarnings,
  SecurityWarningBadge,
  LinkButton,
  type ControllerNodeData,
  type ArchitecturalLayer,
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
