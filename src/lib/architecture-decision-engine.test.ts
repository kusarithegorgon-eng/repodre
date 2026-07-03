import { describe, it, expect } from "vitest";
import {
  classifyFile,
  buildArchGraph,
  CATEGORY_STYLE,
  type ArchCategory,
} from "./architecture-decision-engine";
import type { ParsedModule } from "./ast-parser";

function makeModule(path: string, source: string): ParsedModule {
  return {
    path,
    source,
    exports: [],
    imports: [],
    calls: [],
  };
}

describe("classifyFile", () => {
  it("categorizes /app/ paths as UI_NODE", () => {
    expect(classifyFile("src/app/page.tsx", "")).toBe("UI_NODE");
    expect(classifyFile("app/dashboard/page.tsx", "")).toBe("UI_NODE");
  });

  it("categorizes /pages/ paths as UI_NODE", () => {
    expect(classifyFile("pages/index.tsx", "")).toBe("UI_NODE");
    expect(classifyFile("src/pages/about.tsx", "")).toBe("UI_NODE");
  });

  it("categorizes files with prisma/schema/model as DB_NODE", () => {
    expect(classifyFile("lib/db.ts", "import { prisma } from '@prisma/client'")).toBe("DB_NODE");
    expect(classifyFile("schema/user.ts", "export const userSchema = {}")).toBe("DB_NODE");
    expect(classifyFile("models/User.ts", "export class User {}")).toBe("DB_NODE");
  });

  it("categorizes files with api/server/controller as LOGIC_NODE", () => {
    expect(classifyFile("lib/handler.ts", "export async function apiHandler() {}")).toBe("LOGIC_NODE");
    expect(classifyFile("utils/index.ts", "const server = createServer()")).toBe("LOGIC_NODE");
    expect(classifyFile("routes/user.ts", "class UserController {}")).toBe("LOGIC_NODE");
  });

  it("returns null for files that match no rule", () => {
    expect(classifyFile("lib/utils.ts", "export function add(a, b) { return a + b }")).toBeNull();
    expect(classifyFile("README.md", "# My Project")).toBeNull();
  });

  it("UI path takes priority over DB keywords in content", () => {
    // A page.tsx file that mentions "schema" should still be UI_NODE
    expect(classifyFile("app/page.tsx", "const schema = z.object({})")).toBe("UI_NODE");
  });

  it("path-based LOGIC takes priority over content-based DB", () => {
    // A file at api/ path that mentions "prisma" should be LOGIC_NODE (path wins)
    expect(classifyFile("api/handler.ts", "import { prisma } from '@prisma/client'")).toBe("LOGIC_NODE");
  });

  it("content-based DB takes priority over content-based LOGIC", () => {
    // A file with both "prisma" and "api" in content (not path) should be DB_NODE
    expect(classifyFile("lib/db.ts", "export const api = prisma.client")).toBe("DB_NODE");
  });

  it("is case-insensitive for content matching", () => {
    expect(classifyFile("lib/x.ts", "const PRISMA = require('prisma')")).toBe("DB_NODE");
    expect(classifyFile("lib/x.ts", "export class Controller {}")).toBe("LOGIC_NODE");
  });
});

describe("CATEGORY_STYLE", () => {
  it("assigns distinct shapes to each category", () => {
    const shapes = new Set(Object.values(CATEGORY_STYLE).map((s) => s.shape));
    expect(shapes.size).toBe(3);
  });

  it("assigns distinct accents to each category", () => {
    const accents = new Set(Object.values(CATEGORY_STYLE).map((s) => s.accent));
    expect(accents.size).toBe(3);
  });

  it("uses pill for UI, rectangle for LOGIC, cylinder for DB", () => {
    expect(CATEGORY_STYLE.UI_NODE.shape).toBe("pill");
    expect(CATEGORY_STYLE.LOGIC_NODE.shape).toBe("rectangle");
    expect(CATEGORY_STYLE.DB_NODE.shape).toBe("cylinder");
  });
});

describe("buildArchGraph", () => {
  it("classifies and creates nodes for matching files", () => {
    const modules = [
      makeModule("app/page.tsx", "export default function Page() {}"),
      makeModule("api/users.ts", "export async function apiHandler(req, res) {}"),
      makeModule("lib/prisma.ts", "import { prisma } from '@prisma/client'"),
      makeModule("lib/utils.ts", "export function add(a, b) { return a + b }"),
    ];

    const graph = buildArchGraph(modules);

    expect(graph.nodes).toHaveLength(3);
    const categories = graph.nodes.map((n) => n.category);
    expect(categories).toContain("UI_NODE");
    expect(categories).toContain("LOGIC_NODE");
    expect(categories).toContain("DB_NODE");
  });

  it("generates UI → LOGIC edges when UI files contain fetch calls", () => {
    const modules = [
      makeModule("app/page.tsx", `fetch('/api/users'); return null;`),
      makeModule("api/users.ts", "export async function apiHandler() {}"),
    ];

    const graph = buildArchGraph(modules);

    expect(graph.nodes).toHaveLength(2);
    const uiNode = graph.nodes.find((n) => n.category === "UI_NODE")!;
    const logicNode = graph.nodes.find((n) => n.category === "LOGIC_NODE")!;

    const edge = graph.edges.find(
      (e) => e.from === uiNode.id && e.to === logicNode.id
    );
    expect(edge).toBeDefined();
    expect(edge!.label).toBe("fetch");
  });

  it("generates LOGIC → DB edges when logic files mention DB labels", () => {
    const modules = [
      makeModule("api/users.ts", "import { prisma } from '@prisma/client'; export async function apiHandler() { return prisma.user.findMany(); }"),
      makeModule("lib/user.ts", "import { prisma } from '@prisma/client'; export const user = {}"),
    ];

    const graph = buildArchGraph(modules);

    const logicNode = graph.nodes.find((n) => n.category === "LOGIC_NODE");
    const dbNode = graph.nodes.find((n) => n.category === "DB_NODE");
    expect(logicNode).toBeDefined();
    expect(dbNode).toBeDefined();

    const edge = graph.edges.find(
      (e) => e.from === logicNode!.id && e.to === dbNode!.id
    );
    expect(edge).toBeDefined();
    expect(edge!.label).toBe("query");
  });

  it("generates UI → DB edges for direct client-side DB calls", () => {
    const modules = [
      makeModule("app/page.tsx", "import { supabase } from '@/lib/supabase'; const { data } = await supabase.from('user').select();"),
      makeModule("lib/user.ts", "import { prisma } from '@prisma/client'; export const user = {}"),
    ];

    const graph = buildArchGraph(modules);

    const uiNode = graph.nodes.find((n) => n.category === "UI_NODE");
    const dbNode = graph.nodes.find((n) => n.category === "DB_NODE");
    expect(uiNode).toBeDefined();
    expect(dbNode).toBeDefined();

    const edge = graph.edges.find(
      (e) => e.from === uiNode!.id && e.to === dbNode!.id
    );
    expect(edge).toBeDefined();
    expect(edge!.label).toBe("direct query");
  });

  it("deduplicates edges between the same pair", () => {
    const modules = [
      makeModule("app/page.tsx", "fetch('/api/users'); fetch('/api/users');"),
      makeModule("api/users.ts", "export async function apiHandler() {}"),
    ];

    const graph = buildArchGraph(modules);

    expect(graph.edges).toHaveLength(1);
  });

  it("returns empty graph for modules with no matches", () => {
    const modules = [
      makeModule("lib/utils.ts", "export function add(a, b) { return a + b }"),
      makeModule("README.md", "# Project"),
    ];

    const graph = buildArchGraph(modules);
    expect(graph.nodes).toHaveLength(0);
    expect(graph.edges).toHaveLength(0);
  });

  it("extracts route labels for app router pages", () => {
    const modules = [makeModule("app/dashboard/page.tsx", "export default function Page() {}")];
    const graph = buildArchGraph(modules);
    expect(graph.nodes[0].label).toBe("/dashboard");
  });

  it("extracts route labels for pages router", () => {
    const modules = [makeModule("pages/users.tsx", "export default function Users() {}")];
    const graph = buildArchGraph(modules);
    expect(graph.nodes[0].label).toBe("/users");
  });

  it("uses filename as label for non-UI nodes", () => {
    const modules = [makeModule("lib/prisma.ts", "import { prisma } from '@prisma/client'")];
    const graph = buildArchGraph(modules);
    expect(graph.nodes[0].label).toBe("prisma");
  });
});
