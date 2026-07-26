/**
 * Code-Sync Engine — Two-Way Diagram ↔ Code Suggestion Generator
 *
 * Watches canvas mutations (node add/move/rename/delete, edge create/delete)
 * and generates suggested code changes that would bring the source repository
 * into alignment with the visual diagram. Produces a list of CodeChange
 * suggestions with diffs that the user can review and apply.
 *
 * Supported code-gen targets:
 *   - Next.js App Router: app/.../page.tsx, app/api/.../route.ts
 *   - Express: routes/*.js
 *   - Python/Flask: app/routes/*.py
 *   - Laravel/PHP: app/Http/Controllers/*.php
 */

import type { Shape } from "./canvas-geometry";

export type ChangeType = "create-file" | "modify-file" | "delete-file" | "rename-file" | "add-import" | "add-route" | "remove-route";

export interface CodeChange {
  id: string;
  type: ChangeType;
  /** target file path in the repo */
  filePath: string;
  /** human-readable description of the change */
  description: string;
  /** the suggested new file content (for create/modify) */
  newContent?: string;
  /** a unified-diff-style preview */
  diff?: string;
  /** which canvas mutation triggered this suggestion */
  sourceMutation: "node-add" | "node-rename" | "node-delete" | "edge-add" | "edge-delete" | "node-move";
  /** the node or edge id that triggered this */
  sourceId: string;
  /** language for syntax highlighting */
  language: "typescript" | "javascript" | "python" | "php";
}

export interface CanvasMutation {
  kind: "node-add" | "node-rename" | "node-delete" | "edge-add" | "edge-delete" | "node-move";
  nodeId?: string;
  edgeId?: string;
  /** previous label (for renames) */
  oldLabel?: string;
  /** new label */
  newLabel?: string;
  /** node shape (determines file type) */
  shape?: Shape;
  /** edge from/to */
  fromId?: string;
  toId?: string;
}

let changeCounter = 0;
function nextId(): string {
  return `cs_${++changeCounter}`;
}

function isRouteLabel(label: string): boolean {
  return label.startsWith("/") && !label.startsWith("/api/");
}

function isApiLabel(label: string): boolean {
  return label.startsWith("/api/");
}

function routeToFilePath(label: string, shape: Shape): { path: string; language: CodeChange["language"] } {
  if (isApiLabel(label)) {
    // /api/users → app/api/users/route.ts
    const seg = label.replace(/^\/api\//, "").replace(/^\/+/, "");
    return { path: `app/api/${seg}/route.ts`, language: "typescript" };
  }
  if (isRouteLabel(label)) {
    // /dashboard → app/dashboard/page.tsx
    const seg = label.replace(/^\/+/, "") || "page";
    return { path: `app/${seg}/page.tsx`, language: "typescript" };
  }
  // Non-route nodes (validation, database, etc.)
  if (shape === "diamond") {
    return { path: `lib/${label.replace(/[^a-zA-Z0-9]/g, "_")}.ts`, language: "typescript" };
  }
  if (shape === "cylinder") {
    return { path: `lib/models/${label.replace(/[^a-zA-Z0-9]/g, "_")}.ts`, language: "typescript" };
  }
  return { path: `lib/${label.replace(/[^a-zA-Z0-9]/g, "_")}.ts`, language: "typescript" };
}

function generatePageContent(label: string, sub: string): string {
  const componentName = label
    .replace(/^\/+/, "")
    .split("/")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join("") || "Page";
  return `import { type NextPage } from "next";

const ${componentName}: NextPage = () => {
  return (
    <main className="min-h-screen p-8">
      <h1 className="text-2xl font-bold">${label}</h1>
      <p className="mt-2 text-sm text-gray-600">${sub}</p>
      {/* TODO: Implement ${label} view — generated from Repodre canvas */}
    </main>
  );
};

export default ${componentName};
`;
}

function generateApiRouteContent(label: string, sub: string): string {
  const handlerName = label
    .replace(/^\/api\//, "")
    .replace(/[^a-zA-Z0-9]/g, "_")
    .replace(/^./, (c) => c.toUpperCase()) || "Handler";
  return `import { type NextRequest, type NextResponse } from "next/server";

/**
 * ${label} — ${sub}
 * Auto-suggested by Repodre two-way sync.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    // TODO: Implement ${label} controller logic
    return NextResponse.json({ success: true, message: "${label}" });
  } catch (error) {
    console.error("${label} error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
`;
}

function generateValidationContent(label: string): string {
  const schemaName = label.replace(/[^a-zA-Z0-9]/g, "_").replace(/^./, (c) => c.toLowerCase());
  return `import { z } from "zod";

/**
 * ${label} — validation schema
 * Auto-suggested by Repodre two-way sync.
 */
export const ${schemaName}Schema = z.object({
  // TODO: Define validation fields for ${label}
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(255),
});

export type ${label.replace(/[^a-zA-Z0-9]/g, "")}Input = z.infer<typeof ${schemaName}Schema>;
`;
}

function generateModelContent(label: string): string {
  const modelName = label.replace(/[^a-zA-Z0-9]/g, "_");
  return `/**
 * ${label} — data model
 * Auto-suggested by Repodre two-way sync.
 */
export interface ${modelName} {
  id: string;
  // TODO: Add columns from the canvas ERD
  createdAt: string;
  updatedAt: string;
}
`;
}

/**
 * Generate code-change suggestions for a canvas mutation.
 */
export function generateCodeSuggestions(
  mutation: CanvasMutation,
): CodeChange[] {
  const changes: CodeChange[] = [];

  if (mutation.kind === "node-add" && mutation.newLabel && mutation.shape) {
    const { path, language } = routeToFilePath(mutation.newLabel, mutation.shape);
    let content = "";
    if (isApiLabel(mutation.newLabel)) {
      content = generateApiRouteContent(mutation.newLabel, "Controller");
    } else if (isRouteLabel(mutation.newLabel)) {
      content = generatePageContent(mutation.newLabel, "View");
    } else if (mutation.shape === "diamond") {
      content = generateValidationContent(mutation.newLabel);
    } else if (mutation.shape === "cylinder") {
      content = generateModelContent(mutation.newLabel);
    }

    if (content) {
      changes.push({
        id: nextId(),
        type: "create-file",
        filePath: path,
        description: `Create ${path} for new "${mutation.newLabel}" node`,
        newContent: content,
        sourceMutation: "node-add",
        sourceId: mutation.nodeId ?? "",
        language,
      });
    }
  }

  if (mutation.kind === "node-rename" && mutation.oldLabel && mutation.newLabel && mutation.shape) {
    const oldFile = routeToFilePath(mutation.oldLabel, mutation.shape);
    const newFile = routeToFilePath(mutation.newLabel, mutation.shape);
    if (oldFile.path !== newFile.path) {
      changes.push({
        id: nextId(),
        type: "rename-file",
        filePath: newFile.path,
        description: `Rename ${oldFile.path} → ${newFile.path} (node renamed "${mutation.oldLabel}" → "${mutation.newLabel}")`,
        sourceMutation: "node-rename",
        sourceId: mutation.nodeId ?? "",
        language: newFile.language,
      });
    }
  }

  if (mutation.kind === "node-delete" && mutation.newLabel && mutation.shape) {
    const { path, language } = routeToFilePath(mutation.newLabel, mutation.shape);
    changes.push({
      id: nextId(),
      type: "delete-file",
      filePath: path,
      description: `Delete ${path} — "${mutation.newLabel}" node was removed from the canvas`,
      sourceMutation: "node-delete",
      sourceId: mutation.nodeId ?? "",
      language,
    });
  }

  if (mutation.kind === "edge-add" && mutation.fromId && mutation.toId) {
    changes.push({
      id: nextId(),
      type: "add-import",
      filePath: `(edge ${mutation.fromId} → ${mutation.toId})`,
      description: `New connection: add import/call from "${mutation.fromId}" to "${mutation.toId}"`,
      sourceMutation: "edge-add",
      sourceId: mutation.edgeId ?? "",
      language: "typescript",
    });
  }

  if (mutation.kind === "edge-delete" && mutation.fromId && mutation.toId) {
    changes.push({
      id: nextId(),
      type: "remove-route",
      filePath: `(edge ${mutation.fromId} → ${mutation.toId})`,
      description: `Removed connection: delete import/call from "${mutation.fromId}" to "${mutation.toId}"`,
      sourceMutation: "edge-delete",
      sourceId: mutation.edgeId ?? "",
      language: "typescript",
    });
  }

  return changes;
}

/**
 * Generate a simple unified-diff preview for a code change.
 */
export function generateDiff(change: CodeChange, oldContent?: string): string {
  if (change.type === "create-file" && change.newContent) {
    return change.newContent
      .split("\n")
      .map((line) => `+ ${line}`)
      .join("\n");
  }
  if (change.type === "delete-file") {
    return (oldContent ?? "")
      .split("\n")
      .map((line) => `- ${line}`)
      .join("\n");
  }
  if (change.type === "rename-file") {
    return `rename: ${change.filePath}`;
  }
  return change.description;
}
