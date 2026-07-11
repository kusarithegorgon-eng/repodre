/**
 * Node Classifier — Architectural Layer Detection
 *
 * Extracted into a standalone module to break the intra-barrel circular
 * dependency between ControllerNode.tsx and smart-link.ts. Both modules
 * need these functions, but smart-link previously imported them from
 * ControllerNode through the same barrel index, causing a TDZ error in
 * production bundles.
 */

export type ArchitecturalLayer = "view" | "controller" | "database" | "validation" | "other";

export function isControllerNode(
  node: { label: string; sub: string; shape: string; accent: string }
): boolean {
  if (node.accent === "teal" || node.accent === "blue") return true;

  const label = node.label.toLowerCase();
  if (label.includes("/api/") || label.includes("controller")) return true;
  if (label.includes("handler") || label.includes("service")) return true;

  const sub = node.sub.toLowerCase();
  if (sub.includes("controller") || sub.includes("endpoint")) return true;
  if (sub.includes("handler") || sub.includes("service")) return true;

  return false;
}

export function classifyNodeLayer(node: {
  label: string;
  sub: string;
  shape: string;
  accent: string;
}): ArchitecturalLayer {
  if (node.shape === "circle" || node.accent === "slate") {
    return "other";
  }

  if (node.shape === "cylinder" || node.accent === "blue") {
    return "database";
  }

  if (node.shape === "pill" || node.accent === "green") {
    return "view";
  }

  if (node.shape === "diamond" || node.accent === "purple") {
    return "validation";
  }

  if (isControllerNode(node)) {
    return "controller";
  }

  return "other";
}
