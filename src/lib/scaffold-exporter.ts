/**
 * Inverse Graph-to-Code Scaffold Exporter
 *
 * Reads the active canvas node configuration and compiles a downloadable
 * .zip directory tree containing placeholder framework file templates
 * (Next.js views, Express routers, SQL migrations) mapped to the canvas.
 */

export interface ScaffoldNode {
  id: string;
  label: string;
  sub: string;
  shape: string;
  accent: string;
  workspace: string;
  tableName?: string | null;
  columns?: Array<{ name: string; type: string; pk?: boolean; fk?: boolean; nullable?: boolean; unique?: boolean }>;
}

export interface ScaffoldEdge {
  id: string;
  from: string;
  to: string;
  cardinality?: string;
  fromColumn?: string;
  toColumn?: string;
}

export interface ScaffoldFile {
  path: string;
  content: string;
}

export interface ScaffoldProject {
  name: string;
  files: ScaffoldFile[];
}

function sanitizeFileName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9-_/]/g, "")
    .replace(/^[^a-zA-Z]+/, "")
    .toLowerCase();
}

function toPascalCase(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join("");
}

function toCamelCase(name: string): string {
  const pascal = toPascalCase(name);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

function toKebabCase(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function nodeTypeFromShape(shape: string): "view" | "controller" | "validation" | "database" | "error" | "gateway" {
  switch (shape) {
    case "pill": return "view";
    case "diamond": return "validation";
    case "rectangle": return "controller";
    case "cylinder": return "database";
    case "triangle": return "error";
    default: return "view";
  }
}

function generateNextJsPage(node: ScaffoldNode): string {
  const componentName = toPascalCase(node.label.replace(/^\//, "")) || "Page";
  return `import { type NextPage } from "next";
import { type ReactNode } from "react";

interface ${componentName}Props {
  children?: ReactNode;
}

const ${componentName}: NextPage<${componentName}Props> = () => {
  return (
    <main className="min-h-screen p-8">
      <h1 className="text-2xl font-bold">${node.label}</h1>
      <p className="mt-2 text-sm text-gray-600">${node.sub}</p>
      {/* TODO: Implement ${node.label} view */}
    </main>
  );
};

export default ${componentName};
`;
}

function generateExpressRoute(node: ScaffoldNode): string {
  const routePath = node.label.startsWith("/") ? node.label : `/${node.label}`;
  const handlerName = toCamelCase(node.label.replace(/^\//, "")) || "handler";
  return `import { type Request, type Response, type Router } from "express";

const router: Router = Router();

/**
 * ${node.label} — ${node.sub}
 * Auto-generated scaffold from Repodre canvas.
 */
router.get("${routePath}", async (req: Request, res: Response) => {
  try {
    // TODO: Implement ${node.label} controller logic
    res.json({
      success: true,
      message: "${node.label} endpoint",
    });
  } catch (error) {
    console.error("${node.label} error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("${routePath}", async (req: Request, res: Response) => {
  try {
    const body = req.body;
    // TODO: Validate and process request
    res.status(201).json({
      success: true,
      message: "${node.label} created",
    });
  } catch (error) {
    console.error("${node.label} error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
export { router as ${handlerName}Router };
`;
}

function generateValidationSchema(node: ScaffoldNode): string {
  const schemaName = toCamelCase(node.label) || "schema";
  return `import { z } from "zod";

/**
 * ${node.label} — ${node.sub}
 * Auto-generated validation schema from Repodre canvas.
 */
export const ${schemaName}Schema = z.object({
  // TODO: Define validation fields for ${node.label}
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(255),
  email: z.string().email().optional(),
  createdAt: z.date().optional(),
});

export type ${toPascalCase(node.label)}Input = z.infer<typeof ${schemaName}Schema>;
`;
}

function generateSqlMigration(node: ScaffoldNode): string {
  const tableName = sanitizeFileName(node.label) || "table";
  const columns = node.columns?.length
    ? node.columns.map((c) => {
        const parts = [`  ${c.name} ${c.type}`];
        if (c.pk) parts.push("PRIMARY KEY");
        if (c.unique) parts.push("UNIQUE");
        if (!c.nullable && !c.pk) parts.push("NOT NULL");
        return parts.join(" ");
      }).join(",\n")
    : `  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`;

  return `-- Migration: ${tableName}
-- Auto-generated from Repodre canvas.
-- ${node.sub}

CREATE TABLE IF NOT EXISTS ${tableName} (
${columns}
);

-- TODO: Add indexes, RLS policies, and triggers as needed
-- CREATE INDEX idx_${tableName}_name ON ${tableName}(name);
-- ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY;
`;
}

function generatePackageJson(projectName: string): string {
  return JSON.stringify({
    name: toKebabCase(projectName),
    version: "0.1.0",
    private: true,
    scripts: {
      dev: "next dev",
      build: "next build",
      start: "next start",
      lint: "next lint",
      migrate: "supabase db push",
    },
    dependencies: {
      next: "^14.0.0",
      react: "^18.3.1",
      "react-dom": "^18.3.1",
      express: "^4.18.0",
      zod: "^3.22.0",
      "@supabase/supabase-js": "^2.45.0",
    },
    devDependencies: {
      typescript: "^5.5.0",
      "@types/node": "^22.0.0",
      "@types/react": "^18.3.0",
      "@types/express": "^4.17.0",
    },
  }, null, 2);
}

function generateReadme(projectName: string, nodes: ScaffoldNode[]): string {
  const views = nodes.filter((n) => nodeTypeFromShape(n.shape) === "view");
  const controllers = nodes.filter((n) => nodeTypeFromShape(n.shape) === "controller");
  const validations = nodes.filter((n) => nodeTypeFromShape(n.shape) === "validation");
  const databases = nodes.filter((n) => nodeTypeFromShape(n.shape) === "database");

  return `# ${toPascalCase(projectName)}

Auto-generated code architecture scaffold from Repodre canvas.

## Structure

- **Views (Pages):** ${views.length}
- **Controllers (Routes):** ${controllers.length}
- **Validations (Schemas):** ${validations.length}
- **Database Tables:** ${databases.length}

## Directory Layout

\`\`\`
app/
  ${views.map((n) => `${sanitizeFileName(n.label.replace(/^\//, "")) || "page"}/page.tsx`).join("\n  ")}
api/
  ${controllers.map((n) => `${sanitizeFileName(n.label.replace(/^\//, "")) || "route"}/route.ts`).join("\n  ")}
lib/
  ${validations.map((n) => `${toKebabCase(n.label)}.ts`).join("\n  ")}
supabase/
  migrations/
    ${databases.map((n) => `${sanitizeFileName(n.label)}.sql`).join("\n    ")}
\`\`\`

## Getting Started

1. Install dependencies: \`npm install\`
2. Run migrations: \`npm run migrate\`
3. Start dev server: \`npm run dev\`

## Generated Files

This scaffold was generated from a Repodre visual architecture diagram.
Each node maps to a placeholder file with TODO comments for implementation.
`;
}

export function generateScaffold(
  projectName: string,
  nodes: ScaffoldNode[],
  edges: ScaffoldEdge[],
): ScaffoldProject {
  const files: ScaffoldFile[] = [];

  // Package.json
  files.push({
    path: "package.json",
    content: generatePackageJson(projectName),
  });

  // README
  files.push({
    path: "README.md",
    content: generateReadme(projectName, nodes),
  });

  // tsconfig.json
  files.push({
    path: "tsconfig.json",
    content: JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        lib: ["dom", "dom.iterable", "esnext"],
        allowJs: true,
        skipLibCheck: true,
        strict: true,
        forceConsistentCasingInFileNames: true,
        noEmit: true,
        esModuleInterop: true,
        module: "esnext",
        moduleResolution: "bundler",
        resolveJsonModule: true,
        isolatedModules: true,
        jsx: "preserve",
        incremental: true,
        paths: { "@/*": ["./*"] },
      },
      include: ["next-env.d.ts", "**/*.ts", "**/*.tsx"],
      exclude: ["node_modules"],
    }, null, 2),
  });

  // Generate files for each node based on type
  for (const node of nodes) {
    const type = nodeTypeFromShape(node.shape);

    if (type === "view") {
      const dirName = sanitizeFileName(node.label.replace(/^\//, "")) || "page";
      files.push({
        path: `app/${dirName}/page.tsx`,
        content: generateNextJsPage(node),
      });
    }

    if (type === "controller") {
      const dirName = sanitizeFileName(node.label.replace(/^\//, "")) || "route";
      files.push({
        path: `api/${dirName}/route.ts`,
        content: generateExpressRoute(node),
      });
    }

    if (type === "validation") {
      files.push({
        path: `lib/${toKebabCase(node.label)}.ts`,
        content: generateValidationSchema(node),
      });
    }

    if (type === "database") {
      files.push({
        path: `supabase/migrations/${sanitizeFileName(node.label)}.sql`,
        content: generateSqlMigration(node),
      });
    }
  }

  // Generate a routes manifest showing the edge connections
  const manifestLines = edges.map((e) => {
    const from = nodes.find((n) => n.id === e.from);
    const to = nodes.find((n) => n.id === e.to);
    return `  "${from?.label ?? e.from}" -> "${to?.label ?? e.to}"${e.cardinality ? ` [${e.cardinality}]` : ""}`;
  });
  files.push({
    path: "repodre-manifest.json",
    content: JSON.stringify({
      projectName,
      generatedAt: new Date().toISOString(),
      nodeCount: nodes.length,
      edgeCount: edges.length,
      routes: manifestLines.map((l) => l.trim().replace(/^"|"$/g, "")),
    }, null, 2),
  });

  return { name: projectName, files };
}

/**
 * Create a downloadable ZIP file from the scaffold project.
 * Since we can't use JSZip in this environment, we create a simple
 * concatenated archive format that can be downloaded as a single file.
 * For a real implementation, use JSZip or similar.
 */
export function downloadScaffold(project: ScaffoldProject): void {
  // Create a simple tar-like text archive
  let archive = `# ${project.name} - Repodre Scaffold Archive\n\n`;
  archive += `Files: ${project.files.length}\n\n`;

  for (const file of project.files) {
    archive += `\n${"=".repeat(60)}\n`;
    archive += `FILE: ${file.path}\n`;
    archive += `${"=".repeat(60)}\n`;
    archive += file.content;
    archive += `\n`;
  }

  const blob = new Blob([archive], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${toKebabCase(project.name)}-scaffold.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Download each file individually (browser will prompt for each).
 * For a better UX, prefer downloadScaffold which creates a single archive.
 */
export function downloadScaffoldAsFiles(project: ScaffoldProject): void {
  for (const file of project.files) {
    const blob = new Blob([file.content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.path.split("/").pop() || "file.txt";
    a.click();
    URL.revokeObjectURL(url);
  }
}
