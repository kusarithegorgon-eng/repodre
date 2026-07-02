/**
 * Webhook Sync Engine — CI/CD Pipeline Simulator
 *
 * Simulates incoming code push events and parses structural mutations
 * to update the canvas node array with smooth transitions.
 */

export interface WebhookEvent {
  id: string;
  type: "push" | "pull_request" | "merge" | "deploy";
  timestamp: Date;
  branch: string;
  author: string;
  commits: CommitInfo[];
}

export interface CommitInfo {
  hash: string;
  message: string;
  author: string;
  timestamp: Date;
  files: FileChange[];
}

export interface FileChange {
  path: string;
  type: "added" | "modified" | "deleted";
  additions: number;
  deletions: number;
}

export interface NodeMutation {
  nodeId: string;
  type: "add" | "update" | "delete" | "move";
  oldNode?: CanvasNodeData;
  newNode?: CanvasNodeData;
  animation: "fade-in" | "fade-out" | "pulse" | "slide";
}

export interface CanvasNodeData {
  id: string;
  label: string;
  sub: string;
  shape: string;
  accent: string;
  x: number;
  y: number;
  workspace: string;
}

const MOCK_COMMIT_MESSAGES = [
  "feat: Add new login endpoint",
  "refactor: Restructure validation flow",
  "fix: Database connection pooling",
  "feat: Add user dashboard routes",
  "chore: Update auth middleware",
  "feat: Implement rate limiting gateway",
  "refactor: Extract common handlers",
  "fix: Correct role-based access logic",
];

const MOCK_AUTHORS = [
  { name: "Developer Alex", email: "alex@repodre.dev" },
  { name: "Architect Sam", email: "sam@repodre.dev" },
  { name: "Engineer Jordan", email: "jordan@repodre.dev" },
];

const BRANCHES = ["main", "develop", "feature/auth", "feature/dashboard"];

export function generateMockWebhookEvent(): WebhookEvent {
  const commitCount = Math.floor(Math.random() * 3) + 1;
  const commits: CommitInfo[] = [];

  for (let i = 0; i < commitCount; i++) {
    const fileCount = Math.floor(Math.random() * 4) + 1;
    const files: FileChange[] = [];

    for (let j = 0; j < fileCount; j++) {
      const changeType: FileChange["type"] = ["added", "modified", "deleted"][
        Math.floor(Math.random() * 3)
      ] as FileChange["type"];

      files.push({
        path: generateMockFilePath(),
        type: changeType,
        additions: Math.floor(Math.random() * 50),
        deletions: Math.floor(Math.random() * 30),
      });
    }

    commits.push({
      hash: generateHash(),
      message: MOCK_COMMIT_MESSAGES[Math.floor(Math.random() * MOCK_COMMIT_MESSAGES.length)],
      author: MOCK_AUTHORS[Math.floor(Math.random() * MOCK_AUTHORS.length)].name,
      timestamp: new Date(Date.now() - Math.random() * 3600000),
      files,
    });
  }

  return {
    id: `wh_${generateHash()}`,
    type: "push",
    timestamp: new Date(),
    branch: BRANCHES[Math.floor(Math.random() * BRANCHES.length)],
    author: MOCK_AUTHORS[Math.floor(Math.random() * MOCK_AUTHORS.length)].name,
    commits,
  };
}

function generateHash(): string {
  return Math.random().toString(16).slice(2, 10);
}

function generateMockFilePath(): string {
  const dirs = ["app/api", "app/routes", "lib", "components", "pages"];
  const files = ["route.ts", "handler.ts", "middleware.ts", "utils.ts", "index.tsx"];

  const dir = dirs[Math.floor(Math.random() * dirs.length)];
  const file = files[Math.floor(Math.random() * files.length)];

  return `${dir}/${file}`;
}

/**
 * Parses a webhook event and generates node mutations for the canvas.
 */
export function parseWebhookToMutations(
  event: WebhookEvent,
  existingNodes: CanvasNodeData[]
): NodeMutation[] {
  const mutations: NodeMutation[] = [];
  const timestamp = Date.now();

  for (const commit of event.commits) {
    for (const file of commit.files) {
      switch (file.type) {
        case "added": {
          // Create a new node for added files
          const newNodeId = `node_webhook_${timestamp}_${generateHash()}`;
          const existingCount = existingNodes.length;

          mutations.push({
            nodeId: newNodeId,
            type: "add",
            newNode: {
              id: newNodeId,
              label: generateNodeLabel(file.path),
              sub: inferNodeSub(file.path),
              shape: inferNodeShape(file.path),
              accent: "green",
              x: 80 + (existingCount % 4) * 280,
              y: 80 + Math.floor(existingCount / 4) * 160,
              workspace: "app",
            },
            animation: "fade-in",
          });
          break;
        }

        case "deleted": {
          // Find and mark nodes for deletion
          const matchingNode = existingNodes.find(
            (n) =>
              n.label.toLowerCase().includes(file.path.toLowerCase().split("/").pop()?.split(".")[0] || "") ||
              file.path.toLowerCase().includes(n.label.toLowerCase())
          );

          if (matchingNode) {
            mutations.push({
              nodeId: matchingNode.id,
              type: "delete",
              oldNode: matchingNode,
              animation: "fade-out",
            });
          }
          break;
        }

        case "modified": {
          // Update node styling to show modification
          const matchingNode = existingNodes.find(
            (n) =>
              n.label.toLowerCase().includes(file.path.toLowerCase().split("/").pop()?.split(".")[0] || "") ||
              file.path.toLowerCase().includes(n.label.toLowerCase())
          );

          if (matchingNode) {
            mutations.push({
              nodeId: matchingNode.id,
              type: "update",
              oldNode: matchingNode,
              newNode: {
                ...matchingNode,
                accent: "blue", // Highlight modified nodes
              },
              animation: "pulse",
            });
          }
          break;
        }
      }
    }
  }

  return mutations;
}

function generateNodeLabel(path: string): string {
  const fileName = path.split("/").pop()?.split(".")[0] || path;
  if (fileName === "route") {
    const parentDir = path.split("/").slice(-2)[0];
    return `/api/${parentDir}`;
  }
  if (fileName === "page") {
    const parentDir = path.split("/").slice(-2)[0];
    return `/${parentDir}`;
  }
  return fileName;
}

function inferNodeSub(path: string): string {
  if (path.includes("/api/")) return "POST · Controller";
  if (path.includes("/routes/")) return "View · Endpoint";
  if (path.includes("middleware")) return "Controller · Middleware";
  if (path.includes("utils") || path.includes("lib")) return "Utility · Helper";
  return "Node · New";
}

function inferNodeShape(path: string): string {
  if (path.includes("/api/")) return "rectangle";
  if (path.includes("/routes/") || path.includes("page.")) return "pill";
  if (path.includes("middleware")) return "hexagon";
  if (path.includes("validation")) return "diamond";
  return "rectangle";
}

/**
 * Applies mutations to the node array with proper handling.
 */
export function applyMutations(
  nodes: CanvasNodeData[],
  mutations: NodeMutation[]
): CanvasNodeData[] {
  let result = [...nodes];

  for (const mutation of mutations) {
    switch (mutation.type) {
      case "add":
        if (mutation.newNode) {
          result = [...result, mutation.newNode];
        }
        break;

      case "delete":
        result = result.filter((n) => n.id !== mutation.nodeId);
        break;

      case "update":
        result = result.map((n) =>
          n.id === mutation.nodeId ? { ...n, ...mutation.newNode } : n
        );
        break;

      case "move":
        result = result.map((n) =>
          n.id === mutation.nodeId ? { ...n, ...mutation.newNode } : n
        );
        break;
    }
  }

  return result;
}
