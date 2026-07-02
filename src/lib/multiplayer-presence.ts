/**
 * Multiplayer Presence State Machine
 *
 * Simulates real-time collaborative presence with ghost cursors,
 * developer labels, and high-contrast color indicators.
 */

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
}

export interface PresenceState {
  collaborators: CollaboratorCursor[];
  sessionId: string;
  roomName: string;
  isConnected: boolean;
}

const CURSOR_COLORS = [
  { primary: "#ef4444", bg: "rgba(239, 68, 68, 0.15)" },    // Red
  { primary: "#8b5cf6", bg: "rgba(139, 92, 246, 0.15)" },  // Purple
  { primary: "#06b6d4", bg: "rgba(6, 182, 212, 0.15)" },   // Cyan
  { primary: "#f97316", bg: "rgba(249, 115, 22, 0.15)" },  // Orange
  { primary: "#ec4899", bg: "rgba(236, 72, 153, 0.15)" },  // Pink
];

const DEVELOPER_NAMES = [
  { name: "Developer Alex", role: "Full-Stack Engineer" },
  { name: "Architect Sam", role: "Systems Architect" },
  { name: "Engineer Jordan", role: "Backend Developer" },
  { name: "Designer Taylor", role: "UI/UX Designer" },
  { name: "Lead Casey", role: "Tech Lead" },
];

const ACTIONS = [
  "Exploring flow diagram",
  "Reviewing architecture",
  "Editing node configuration",
  "Adding new endpoint",
  "Optimizing edge routes",
  "Checking validation logic",
];

export function generateMockCollaborators(count: number): CollaboratorCursor[] {
  const collaborators: CollaboratorCursor[] = [];
  const usedNames = new Set<string>();

  for (let i = 0; i < count; i++) {
    let availableNames = DEVELOPER_NAMES.filter((n) => !usedNames.has(n.name));
    if (availableNames.length === 0) availableNames = DEVELOPER_NAMES;

    const devInfo = availableNames[Math.floor(Math.random() * availableNames.length)];
    usedNames.add(devInfo.name);

    const colorConfig = CURSOR_COLORS[i % CURSOR_COLORS.length];

    collaborators.push({
      id: `collab_${i}_${Date.now()}`,
      name: devInfo.name,
      role: devInfo.role,
      color: colorConfig.primary,
      backgroundColor: colorConfig.bg,
      position: {
        x: Math.random() * 800 + 100,
        y: Math.random() * 400 + 100,
      },
      velocity: {
        x: (Math.random() - 0.5) * 2,
        y: (Math.random() - 0.5) * 2,
      },
      targetNode: null,
      lastUpdate: Date.now(),
      isTyping: Math.random() > 0.7,
      currentAction: ACTIONS[Math.floor(Math.random() * ACTIONS.length)],
    });
  }

  return collaborators;
}

/**
 * Updates cursor positions with smooth interpolation toward target.
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

  // Randomly select a new target node occasionally
  if (!cursor.targetNode || Math.random() < 0.01) {
    const randomNode = nodes[Math.floor(Math.random() * nodes.length)];
    cursor.targetNode = randomNode?.id || null;
  }

  let newPosition = { ...cursor.position };

  if (cursor.targetNode) {
    const targetNode = nodes.find((n) => n.id === cursor.targetNode);
    if (targetNode) {
      // Move toward the target node
      const dx = targetNode.x - cursor.position.x;
      const dy = targetNode.y - cursor.position.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance > 10) {
        const speed = 80 * zoom * elapsed;
        newPosition.x += (dx / distance) * speed;
        newPosition.y += (dy / distance) * speed;
      }

      // Reached target, pick new one
      if (distance < 20) {
        cursor.targetNode = null;
      }
    }
  } else {
    // Random wandering with smooth velocity
    cursor.velocity.x += (Math.random() - 0.5) * 0.5;
    cursor.velocity.y += (Math.random() - 0.5) * 0.5;

    // Dampen velocity
    cursor.velocity.x *= 0.95;
    cursor.velocity.y *= 0.95;

    // Clamp velocity
    const maxVel = 2;
    cursor.velocity.x = Math.max(-maxVel, Math.min(maxVel, cursor.velocity.x));
    cursor.velocity.y = Math.max(-maxVel, Math.min(maxVel, cursor.velocity.y));

    // Apply velocity
    newPosition.x += cursor.velocity.x * zoom * elapsed * 60;
    newPosition.y += cursor.velocity.y * zoom * elapsed * 60;
  }

  // Clamp to canvas bounds (with padding)
  const padding = 50;
  newPosition.x = Math.max(padding, Math.min(canvasWidth - padding, newPosition.x));
  newPosition.y = Math.max(padding, Math.min(canvasHeight - padding, newPosition.y));

  return {
    ...cursor,
    position: newPosition,
    lastUpdate: now,
    isTyping: Math.random() > 0.9 ? !cursor.isTyping : cursor.isTyping,
  };
}

/**
 * Creates the initial presence state with mock collaborators.
 */
export function initializePresenceState(): PresenceState {
  return {
    collaborators: generateMockCollaborators(2 + Math.floor(Math.random() * 2)),
    sessionId: `session_${Date.now()}`,
    roomName: "architecture-review",
    isConnected: true,
  };
}

/**
 * Returns presence state after connecting/disconnecting.
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
    collaborators: generateMockCollaborators(2 + Math.floor(Math.random() * 2)),
  };
}
