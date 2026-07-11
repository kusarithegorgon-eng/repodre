/**
 * Multiplayer Presence State Machine
 *
 * Loads real project members from the project_members table and renders
 * them as animated ghost cursors on the canvas. Falls back to an empty
 * collaborator list when no members exist or the user is offline.
 */

import { supabase } from "@/lib/supabase";

export interface CollaboratorCursor {
  id: string;
  name: string;
  role: string;
  color: string;
  backgroundColor: string;
  position: { x: number; y: number };
  velocity: { x: number; y: number };
  targetNode: string | null;
  lastUpdate: number;
  isTyping: boolean;
  currentAction: string;
  cursorToken: string;
}

export interface PresenceState {
  collaborators: CollaboratorCursor[];
  sessionId: string;
  roomName: string;
  isConnected: boolean;
  lastSnapshotAt: number;
}

const CURSOR_COLORS = [
  { primary: "#ef4444", bg: "rgba(239, 68, 68, 0.15)" },
  { primary: "#8b5cf6", bg: "rgba(139, 92, 246, 0.15)" },
  { primary: "#06b6d4", bg: "rgba(6, 182, 212, 0.15)" },
  { primary: "#f97316", bg: "rgba(249, 115, 22, 0.15)" },
  { primary: "#ec4899", bg: "rgba(236, 72, 153, 0.15)" },
  { primary: "#10b981", bg: "rgba(16, 185, 129, 0.15)" },
  { primary: "#f59e0b", bg: "rgba(245, 158, 11, 0.15)" },
];

const ACTIONS = [
  "Exploring flow diagram",
  "Reviewing architecture",
  "Editing node configuration",
  "Adding new endpoint",
  "Optimizing edge routes",
  "Checking validation logic",
];

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Admin",
  EDITOR: "Editor",
  VIEWER: "Viewer",
};

export interface ProjectMemberRow {
  id: string;
  user_id: string;
  email: string;
  role: string;
}

/**
 * Fetches real project members from Supabase and converts them to
 * CollaboratorCursor objects with assigned colors and initial positions.
 */
export async function loadProjectMembers(
  projectId: string,
  currentUserId?: string | null
): Promise<CollaboratorCursor[]> {
  const { data, error } = await supabase
    .from("project_members")
    .select("id, user_id, email, role")
    .eq("project_id", projectId);

  if (error || !data) return [];

  const members = data as ProjectMemberRow[];
  const now = Date.now();

  return members
    .filter((m) => m.user_id !== currentUserId)
    .map((member, index) => {
      const colorConfig = CURSOR_COLORS[index % CURSOR_COLORS.length];
      const displayName = member.email.split("@")[0] || "User";
      const capitalized =
        displayName.charAt(0).toUpperCase() + displayName.slice(1);

      return {
        id: member.id,
        name: capitalized,
        role: ROLE_LABELS[member.role] ?? member.role,
        color: colorConfig.primary,
        backgroundColor: colorConfig.bg,
        position: {
          x: Math.random() * 600 + 100,
          y: Math.random() * 300 + 100,
        },
        velocity: { x: 0, y: 0 },
        targetNode: null,
        lastUpdate: now,
        isTyping: false,
        currentAction: ACTIONS[Math.floor(Math.random() * ACTIONS.length)],
        cursorToken: `tok_${member.id}_${now}`,
      };
    });
}

/**
 * Updates cursor positions with smooth interpolation toward target nodes.
 */
export function updateCursorPosition(
  cursor: CollaboratorCursor,
  nodes: Array<{ id: string; label: string; x: number; y: number }>,
  canvasWidth: number,
  canvasHeight: number,
  zoom: number
): CollaboratorCursor {
  const now = Date.now();
  const elapsed = (now - cursor.lastUpdate) / 1000;

  if (!cursor.targetNode || Math.random() < 0.005) {
    const randomNode = nodes[Math.floor(Math.random() * nodes.length)];
    cursor.targetNode = randomNode?.id || null;
  }

  let newPosition = { ...cursor.position };

  if (cursor.targetNode) {
    const targetNode = nodes.find((n) => n.id === cursor.targetNode);
    if (targetNode) {
      const dx = targetNode.x - cursor.position.x;
      const dy = targetNode.y - cursor.position.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance > 10) {
        const speed = 80 * zoom * elapsed;
        newPosition.x += (dx / distance) * speed;
        newPosition.y += (dy / distance) * speed;
      }

      if (distance < 20) {
        cursor.targetNode = null;
      }
    }
  } else {
    cursor.velocity.x += (Math.random() - 0.5) * 0.5;
    cursor.velocity.y += (Math.random() - 0.5) * 0.5;
    cursor.velocity.x *= 0.95;
    cursor.velocity.y *= 0.95;
    const maxVel = 2;
    cursor.velocity.x = Math.max(-maxVel, Math.min(maxVel, cursor.velocity.x));
    cursor.velocity.y = Math.max(-maxVel, Math.min(maxVel, cursor.velocity.y));
    newPosition.x += cursor.velocity.x * zoom * elapsed * 60;
    newPosition.y += cursor.velocity.y * zoom * elapsed * 60;
  }

  const padding = 50;
  newPosition.x = Math.max(padding, Math.min(canvasWidth - padding, newPosition.x));
  newPosition.y = Math.max(padding, Math.min(canvasHeight - padding, newPosition.y));

  return {
    ...cursor,
    position: newPosition,
    lastUpdate: now,
    isTyping: Math.random() > 0.95 ? !cursor.isTyping : cursor.isTyping,
  };
}

/**
 * Creates an empty presence state. Collaborators are loaded
 * asynchronously via loadProjectMembers.
 */
export function initializePresenceState(): PresenceState {
  return {
    collaborators: [],
    sessionId: `session_${Date.now()}`,
    roomName: "project-session",
    isConnected: true,
    lastSnapshotAt: Date.now(),
  };
}

/**
 * Toggles connection state. When reconnecting, returns empty collaborators
 * — the caller must re-fetch members via loadProjectMembers.
 */
export function toggleConnection(state: PresenceState): PresenceState {
  if (state.isConnected) {
    return {
      ...state,
      isConnected: false,
      collaborators: [],
    };
  }

  return {
    ...state,
    isConnected: true,
    collaborators: [],
    lastSnapshotAt: Date.now(),
  };
}
