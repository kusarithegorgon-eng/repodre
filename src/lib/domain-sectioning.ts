/**
 * Domain-Driven Sectioning Engine
 *
 * Implements three key features for organized flowchart visualization:
 *
 * 1. ROLE GATEWAY SWITCH
 *    - Detects post-login auth sequences and creates a switch node
 *    - Routes to different dashboard sections based on user role
 *
 * 2. VISUAL CANVAS REGIONS
 *    - Groups routes by directory prefix namespaces
 *    - Creates section bounding boxes with dashed borders
 *
 * 3. PORTAL LINKS
 *    - Cross-section references without spaghetti lines
 *    - Short connector terminating in a portal label
 */

import type { Shape } from "./canvas-geometry";
import type { BlueprintNode, BlueprintEdge, Blueprint } from "./blueprint-analyzer";
import type { NormalizedRoute } from "./route-normalizer";

// ─── Types ────────────────────────────────────────────────────────────────────

export type UserRole = "customer" | "manager" | "staff" | "admin" | "user";

export interface RoleGateway {
  id: string;
  label: string;
  sub: string;
  shape: Shape;
  accent: "orange";
  /** The auth controller that precedes this gateway */
  authControllerKey: string;
  /** Detected roles and their destination routes */
  roles: RoleDestination[];
  /** Position will be assigned by the layout engine */
  x?: number;
  y?: number;
}

export interface RoleDestination {
  role: UserRole;
  label: string;
  routeKey: string;
  routePath: string;
}

export interface CanvasSection {
  id: string;
  label: string;
  title: string;
  /** Directory prefix for this section (e.g., 'app/dashboard/manager') */
  prefix: string;
  /** Node IDs belonging to this section */
  nodeIds: string[];
  /** Bounding box computed by layout engine */
  bounds: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
  /** Section styling */
  style: SectionStyle;
  /** Role associated with this section (if applicable) */
  role?: UserRole;
}

export interface SectionStyle {
  borderColor: string;
  borderStyle: "dashed" | "solid" | "dotted";
  borderDashArray: string;
  backgroundColor: string;
  opacity: number;
  headerColor: string;
}

export interface PortalLink {
  id: string;
  /** Source node ID */
  fromNodeId: string;
  /** Source section ID */
  fromSectionId: string;
  /** Target section ID */
  toSectionId: string;
  /** Display text for the portal */
  label: string;
  /** Position of the portal endpoint */
  portalPoint: { x: number; y: number };
}

export interface SectionedBlueprint {
  /** Original blueprint nodes */
  nodes: BlueprintNode[];
  /** Original blueprint edges */
  edges: BlueprintEdge[];
  /** Role gateway nodes added */
  roleGateways: RoleGateway[];
  /** Detected canvas sections */
  sections: CanvasSection[];
  /** Portal links for cross-section navigation */
  portalLinks: PortalLink[];
  /** Edges that should be replaced by portal links */
  edgesTo portals: string[];
}

// ─── Section Detection ────────────────────────────────────────────────────────

const SECTION_CONFIGS: Array<{
  patterns: RegExp[];
  role: UserRole;
  title: string;
  color: string;
  borderDash: string;
}> = [
  {
    patterns: [
      /dashboard\/manager/i,
      /manager\//i,
      /admin\/dashboard/i,
    ],
    role: "manager",
    title: "MANAGER WORKSPACE",
    color: "var(--neon-purple)",
    borderDash: "12 6",
  },
  {
    patterns: [
      /dashboard\/customer/i,
      /customer\//i,
      /shop\//i,
      /store\//i,
      /account\//i,
    ],
    role: "customer",
    title: "CUSTOMER ACTIONS",
    color: "var(--neon-green)",
    borderDash: "8 4",
  },
  {
    patterns: [
      /dashboard\/staff/i,
      /staff\//i,
      /employee\//i,
      /worker\//i,
    ],
    role: "staff",
    title: "STAFF PANEL",
    color: "var(--neon-blue)",
    borderDash: "6 4",
  },
  {
    patterns: [
      /admin\//i,
      /settings\//i,
      /system\//i,
    ],
    role: "admin",
    title: "ADMIN CONSOLE",
    color: "var(--teal)",
    borderDash: "10 5",
  },
];

/**
 * Detects which section a node belongs to based on its source path.
 */
export function detectSection(
  node: BlueprintNode,
  normalizedRoutes: NormalizedRoute[]
): UserRole | null {
  const path = node.sourcePath?.toLowerCase() ?? "";
  const routeKey = node.key?.toLowerCase() ?? "";

  for (const config of SECTION_CONFIGS) {
    for (const pattern of config.patterns) {
      if (pattern.test(path) || pattern.test(routeKey)) {
        return config.role;
      }
    }
  }

  return null;
}

/**
 * Groups nodes into canvas sections based on directory prefixes.
 */
export function detectSections(
  nodes: BlueprintNode[],
  normalizedRoutes: NormalizedRoute[]
): CanvasSection[] {
  const sections: CanvasSection[] = [];
  const nodeToSection = new Map<string, string>();

  // Create sections for each detected role prefix
  for (const config of SECTION_CONFIGS) {
    const sectionNodes: string[] = [];

    for (const node of nodes) {
      const role = detectSection(node, normalizedRoutes);
      if (role === config.role) {
        sectionNodes.push(node.id);
        nodeToSection.set(node.id, config.role);
      }
    }

    if (sectionNodes.length > 0) {
      const sectionId = `section_${config.role}`;
      sections.push({
        id: sectionId,
        label: config.role,
        title: config.title,
        prefix: config.role,
        nodeIds: sectionNodes,
        bounds: { x: 0, y: 0, w: 0, h: 0 },
        style: {
          borderColor: config.color,
          borderStyle: "dashed",
          borderDashArray: config.borderDash,
          backgroundColor: `${config.color}08`,
          opacity: 0.15,
          headerColor: config.color,
        },
        role: config.role,
      });
    }
  }

  // Create a default section for ungrouped nodes
  const ungroupedNodes = nodes.filter((n) => !nodeToSection.has(n.id));
  if (ungroupedNodes.length > 0) {
    sections.push({
      id: "section_default",
      label: "default",
      title: "APPLICATION FLOW",
      prefix: "",
      nodeIds: ungroupedNodes.map((n) => n.id),
      bounds: { x: 0, y: 0, w: 0, h: 0 },
      style: {
        borderColor: "var(--border)",
        borderStyle: "solid",
        borderDashArray: "none",
        backgroundColor: "transparent",
        opacity: 1,
        headerColor: "var(--muted-foreground)",
      },
    });
  }

  return sections;
}

// ─── Role Gateway Detection ───────────────────────────────────────────────────

const AUTH_PATTERNS = [
  /\/api\/auth\/login/i,
  /\/api\/auth\/signin/i,
  /\/api\/auth\/authenticate/i,
  /\/auth\/login/i,
  /\/login/i,
  /\/signin/i,
];

const ROLE_REDIRECT_PATTERNS: Array<{
  pattern: RegExp;
  role: UserRole;
}> = [
  { pattern: /manager|admin/i, role: "manager" },
  { pattern: /customer|user/i, role: "customer" },
  { pattern: /staff|employee/i, role: "staff" },
];

/**
 * Detects post-login role gateways based on auth controllers.
 *
 * When a controller matches an auth pattern, examines subsequent routes
 * to determine role-based destinations.
 */
export function detectRoleGateways(
  nodes: BlueprintNode[],
  edges: BlueprintEdge[],
  sections: CanvasSection[]
): RoleGateway[] {
  const gateways: RoleGateway[] = [];
  let gatewayCounter = 0;

  for (const node of nodes) {
    if (node.type !== "controller") continue;

    const isAuthController = AUTH_PATTERNS.some((p) => p.test(node.key));
    if (!isAuthController) continue;

    // Find destination routes from this controller
    const destinations: RoleDestination[] = [];
    const outEdges = edges.filter((e) => e.from === node.id);

    for (const edge of outEdges) {
      const targetNode = nodes.find((n) => n.id === edge.to);
      if (!targetNode || targetNode.type !== "view") continue;

      // Determine the role based on the target's section
      const targetSection = sections.find((s) =>
        s.nodeIds.includes(targetNode.id)
      );

      const role = targetSection?.role ?? "user";
      const label = formatRoleLabel(role);

      destinations.push({
        role,
        label,
        routeKey: targetNode.key,
        routePath: targetNode.label,
      });
    }

    // Only create a gateway if there are multiple role destinations
    if (destinations.length >= 2) {
      const uniqueRoles = new Set(destinations.map((d) => d.role));
      if (uniqueRoles.size >= 2) {
        gateways.push({
          id: `gateway_${++gatewayCounter}`,
          label: "Redirect by User Role",
          sub: formatRolesSubtitle(destinations.map((d) => d.role)),
          shape: "hexagon",
          accent: "orange",
          authControllerKey: node.key,
          roles: destinations,
        });
      }
    }
  }

  return gateways;
}

function formatRoleLabel(role: UserRole): string {
  const labels: Record<UserRole, string> = {
    customer: "Customer Dashboard",
    manager: "Manager Dashboard",
    staff: "Staff Portal",
    admin: "Admin Console",
    user: "User Home",
  };
  return labels[role] ?? "User Dashboard";
}

function formatRolesSubtitle(roles: UserRole[]): string {
  const unique = [...new Set(roles)];
  const capitalized = unique.map((r) =>
    r.charAt(0).toUpperCase() + r.slice(1)
  );
  return `${capitalized.join(" / ")}`;
}

// ─── Portal Link Detection ────────────────────────────────────────────────────

/**
 * Detects edges that cross section boundaries and should be replaced by portal links.
 */
export function detectPortalLinks(
  nodes: BlueprintNode[],
  edges: BlueprintEdge[],
  sections: CanvasSection[]
): { portalLinks: PortalLink[]; edgesToPortals: string[] } {
  const portalLinks: PortalLink[] = [];
  const edgesToPortals: string[] = [];
  let portalCounter = 0;

  // Build node -> section mapping
  const nodeToSection = new Map<string, string>();
  for (const section of sections) {
    for (const nodeId of section.nodeIds) {
      nodeToSection.set(nodeId, section.id);
    }
  }

  for (const edge of edges) {
    const fromSection = nodeToSection.get(edge.from);
    const toSection = nodeToSection.get(edge.to);

    // If sections differ, this edge crosses a boundary
    if (fromSection && toSection && fromSection !== toSection) {
      const targetSection = sections.find((s) => s.id === toSection);
      if (!targetSection) continue;

      // Determine if this is a long cross-section edge
      const fromNode = nodes.find((n) => n.id === edge.from);
      const toNode = nodes.find((n) => n.id === edge.to);

      if (!fromNode || !toNode) continue;

      // Create portal link
      portalLinks.push({
        id: `portal_${++portalCounter}`,
        fromNodeId: edge.from,
        fromSectionId: fromSection,
        toSectionId: toSection,
        label: `Go to [${targetSection.title}]`,
        portalPoint: { x: 0, y: 0 }, // Will be set by layout engine
      });

      edgesToPortals.push(edge.id);
    }
  }

  return { portalLinks, edgesToPortals };
}

// ─── Main Sectioning Function ─────────────────────────────────────────────────

/**
 * Applies domain-driven sectioning to a blueprint.
 */
export function applySectioning(
  blueprint: Blueprint,
  normalizedRoutes: NormalizedRoute[]
): SectionedBlueprint {
  // Detect sections based on directory structure
  const sections = detectSections(blueprint.nodes, normalizedRoutes);

  // Detect role gateways at auth boundaries
  const roleGateways = detectRoleGateways(
    blueprint.nodes,
    blueprint.edges,
    sections
  );

  // Detect portal links for cross-section edges
  const { portalLinks, edgesToPortals } = detectPortalLinks(
    blueprint.nodes,
    blueprint.edges,
    sections
  );

  return {
    nodes: blueprint.nodes,
    edges: blueprint.edges,
    roleGateways,
    sections,
    portalLinks,
    edgesToPortals,
  };
}

/**
 * Gets the style for a portal link.
 */
export function getPortalLinkStyle(
  portalLink: PortalLink,
  sections: CanvasSection[]
): {
  color: string;
  dashArray: string;
  opacity: number;
} {
  const targetSection = sections.find((s) => s.id === portalLink.toSectionId);
  const color = targetSection?.style.headerColor ?? "var(--teal)";

  return {
    color,
    dashArray: "4 4",
    opacity: 0.6,
  };
}
