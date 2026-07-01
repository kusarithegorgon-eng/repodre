import { describe, expect, it } from "vitest";
import {
  crawlRoutes,
  extractInteractions,
  detectValidationGates,
  crawlRepository,
  parseImports,
  resolveImportPath,
  buildConsolidatedSource,
  extractRouteLikeStrings,
  fuzzyMatchRoute,
} from "./repo-crawler";

// ─── Route Crawler tests ────────────────────────────────────────────────────

describe("crawlRoutes — directory file listing scanner", () => {
  it("detects Next.js App Router page.tsx files", () => {
    const files = [
      "app/page.tsx",
      "app/billing/page.tsx",
      "app/billing/history/page.tsx",
      "app/users/[id]/page.tsx",
    ];
    const routes = crawlRoutes(files);
    expect(routes).toHaveLength(4);
    expect(routes.map((r) => r.route).sort()).toEqual([
      "/",
      "/billing",
      "/billing/history",
      "/users/:id",
    ]);
  });

  it("extracts route name from directory path", () => {
    const files = ["app/billing/history/page.tsx"];
    const routes = crawlRoutes(files);
    expect(routes[0].route).toBe("/billing/history");
  });

  it("detects Next.js Pages Router files", () => {
    const files = [
      "pages/index.tsx",
      "pages/about.tsx",
      "pages/users/[id].tsx",
    ];
    const routes = crawlRoutes(files);
    expect(routes.map((r) => r.route).sort()).toEqual(["/", "/about", "/users/:id"]);
  });

  it("skips API routes and special files in Pages Router", () => {
    const files = [
      "pages/api/auth.ts",
      "pages/_app.tsx",
      "pages/_document.tsx",
      "pages/404.tsx",
      "pages/profile.tsx",
    ];
    const routes = crawlRoutes(files);
    expect(routes).toHaveLength(1);
    expect(routes[0].route).toBe("/profile");
  });

  it("handles route groups in App Router", () => {
    const files = [
      "app/(auth)/login/page.tsx",
      "app/(auth)/register/page.tsx",
    ];
    const routes = crawlRoutes(files);
    expect(routes.map((r) => r.route).sort()).toEqual(["/login", "/register"]);
  });

  it("handles dynamic segments with named parameters", () => {
    const files = [
      "app/posts/[id]/page.tsx",
      "app/shop/[slug]/page.tsx",
    ];
    const routes = crawlRoutes(files);
    expect(routes.map((r) => r.route).sort()).toEqual(["/posts/:id", "/shop/:slug"]);
  });

  it("handles catch-all dynamic segments", () => {
    const files = ["app/docs/[...slug]/page.tsx"];
    const routes = crawlRoutes(files);
    expect(routes[0].route).toBe("/docs/:slug");
  });

  it("marks dynamic routes with the dynamic flag", () => {
    const files = [
      "app/static-page/page.tsx",
      "app/users/[id]/page.tsx",
    ];
    const routes = crawlRoutes(files);
    const staticRoute = routes.find((r) => r.route === "/static-page");
    const dynamicRoute = routes.find((r) => r.route === "/users/:id");
    expect(staticRoute?.dynamic).toBe(false);
    expect(dynamicRoute?.dynamic).toBe(true);
  });

  it("detects Vite/CRA src/index.js entry", () => {
    const files = ["src/index.js", "src/App.tsx"];
    const routes = crawlRoutes(files);
    expect(routes).toHaveLength(1);
    expect(routes[0].route).toBe("/");
  });

  it("deduplicates routes with the same path", () => {
    const files = [
      "app/page.tsx",
      "app/page.jsx",
      "app/page.js",
    ];
    const routes = crawlRoutes(files);
    expect(routes).toHaveLength(1);
  });

  it("ignores non-route files", () => {
    const files = [
      "lib/utils.ts",
      "components/Button.tsx",
      "node_modules/react/index.js",
      "package.json",
    ];
    const routes = crawlRoutes(files);
    expect(routes).toHaveLength(0);
  });
});

// ─── Interaction Extractor tests ────────────────────────────────────────────

describe("extractInteractions — link and action scanner", () => {
  it("detects <Link href> patterns", () => {
    const source = `
      import Link from 'next/link';
      export default function Page() {
        return <Link href="/dashboard">Dashboard</Link>;
      }
    `;
    const interactions = extractInteractions(source);
    expect(interactions).toHaveLength(1);
    expect(interactions[0].kind).toBe("link");
    expect(interactions[0].target).toBe("/dashboard");
  });

  it("detects router.push patterns", () => {
    const source = `
      const router = useRouter();
      function handleSubmit() {
        router.push("/api/submit");
      }
    `;
    const interactions = extractInteractions(source);
    expect(interactions.some((i) => i.kind === "router-push" && i.target === "/api/submit")).toBe(true);
  });

  it("detects navigate() patterns (React Router v6)", () => {
    const source = `
      const navigate = useNavigate();
      function go() { navigate("/profile"); }
    `;
    const interactions = extractInteractions(source);
    expect(interactions.some((i) => i.kind === "router-push" && i.target === "/profile")).toBe(true);
  });

  it("detects onClick handlers", () => {
    const source = `
      <button onClick={() => router.push("/submit")}>Submit</button>
    `;
    const interactions = extractInteractions(source);
    expect(interactions.some((i) => i.kind === "on-click")).toBe(true);
  });

  it("detects onSubmit handlers", () => {
    const source = `
      <form onSubmit={(e) => { e.preventDefault(); fetch("/api/form"); }}>
      </form>
    `;
    const interactions = extractInteractions(source);
    expect(interactions.some((i) => i.kind === "on-submit")).toBe(true);
  });

  it("extracts multiple interactions from the same file", () => {
    const source = `
      <Link href="/home">Home</Link>
      <Link href="/about">About</Link>
      <button onClick={() => router.push("/submit")}>Go</button>
    `;
    const interactions = extractInteractions(source);
    expect(interactions.length).toBeGreaterThanOrEqual(3);
  });

  it("reports correct line numbers", () => {
    const source = `\n\n\n<Link href="/page">Page</Link>`;
    const interactions = extractInteractions(source);
    expect(interactions[0].line).toBe(4);
  });
});

// ─── Validation Gate detection tests ─────────────────────────────────────────

describe("detectValidationGates — schema and if/else detection", () => {
  it("detects Zod schemas", () => {
    const source = `
      const schema = z.object({
        email: z.string().email(),
        password: z.string().min(8),
      });
    `;
    const gates = detectValidationGates(source);
    expect(gates.some((g) => g.kind === "zod")).toBe(true);
  });

  it("detects Zod safeParse calls", () => {
    const source = `const result = schema.safeParse(data);`;
    const gates = detectValidationGates(source);
    expect(gates.some((g) => g.kind === "zod")).toBe(true);
  });

  it("detects Yup schemas", () => {
    const source = `
      const schema = yup.object({
        email: yup.string().email().required(),
      });
    `;
    const gates = detectValidationGates(source);
    expect(gates.some((g) => g.kind === "yup")).toBe(true);
  });

  it("detects Joi schemas", () => {
    const source = `
      const schema = Joi.object({
        username: Joi.string().alphanum().min(3).max(30).required(),
      });
    `;
    const gates = detectValidationGates(source);
    expect(gates.some((g) => g.kind === "joi")).toBe(true);
  });

  it("detects if/else session guards", () => {
    const source = `
      if (!session) {
        redirect("/login");
      }
    `;
    const gates = detectValidationGates(source);
    expect(gates.some((g) => g.kind === "if-else" && g.label.includes("session"))).toBe(true);
  });

  it("detects if/else error checks", () => {
    const source = `
      if (errors) {
        return { errors };
      }
    `;
    const gates = detectValidationGates(source);
    expect(gates.some((g) => g.kind === "if-else")).toBe(true);
  });

  it("returns empty array when no validation is present", () => {
    const source = `
      export default function Page() {
        return <div>Hello</div>;
      }
    `;
    const gates = detectValidationGates(source);
    expect(gates).toHaveLength(0);
  });
});

// ─── Component Recursive Dependency Resolver tests ───────────────────────────

describe("parseImports — import statement extraction", () => {
  it("extracts default imports", () => {
    const source = `import Link from 'next/link';`;
    const imports = parseImports(source);
    expect(imports).toHaveLength(1);
    expect(imports[0].specifier).toBe("next/link");
  });

  it("extracts named imports", () => {
    const source = `import { useState } from 'react';`;
    const imports = parseImports(source);
    expect(imports[0].specifier).toBe("react");
  });

  it("extracts side-effect imports", () => {
    const source = `import './globals.css';`;
    const imports = parseImports(source);
    expect(imports[0].specifier).toBe("./globals.css");
  });

  it("extracts require() calls", () => {
    const source = `const fs = require('fs');`;
    const imports = parseImports(source);
    expect(imports[0].specifier).toBe("fs");
  });

  it("deduplicates identical specifiers", () => {
    const source = `
      import { foo } from './utils';
      import { bar } from './utils';
    `;
    const imports = parseImports(source);
    expect(imports).toHaveLength(1);
  });

  it("reports correct line numbers", () => {
    const source = `\n\nimport { x } from './mod';`;
    const imports = parseImports(source);
    expect(imports[0].line).toBe(3);
  });
});

describe("resolveImportPath — specifier to file path resolution", () => {
  it("resolves relative imports with extension", () => {
    const filePaths = new Set(["app/components/Button.tsx"]);
    const result = resolveImportPath("./components/Button", "app/page.tsx", filePaths);
    expect(result).toBe("app/components/Button.tsx");
  });

  it("resolves path alias @/ imports", () => {
    const filePaths = new Set(["src/components/Form.tsx"]);
    const result = resolveImportPath("@/components/Form", "app/page.tsx", filePaths);
    expect(result).toBe("src/components/Form.tsx");
  });

  it("resolves parent directory imports", () => {
    const filePaths = new Set(["app/lib/auth.ts"]);
    const result = resolveImportPath("../lib/auth", "app/billing/page.tsx", filePaths);
    expect(result).toBe("app/lib/auth.ts");
  });

  it("resolves index files", () => {
    const filePaths = new Set(["app/components/index.tsx"]);
    const result = resolveImportPath("./components", "app/page.tsx", filePaths);
    expect(result).toBe("app/components/index.tsx");
  });

  it("returns null for bare module imports", () => {
    const filePaths = new Set(["app/page.tsx"]);
    const result = resolveImportPath("react", "app/page.tsx", filePaths);
    expect(result).toBeNull();
  });

  it("returns null for unresolvable paths", () => {
    const filePaths = new Set(["app/page.tsx"]);
    const result = resolveImportPath("./nonexistent", "app/page.tsx", filePaths);
    expect(result).toBeNull();
  });
});

describe("buildConsolidatedSource — recursive dependency resolution", () => {
  it("includes the page's own source", () => {
    const contents = new Map([
      ["app/page.tsx", "export default function Page() { return <div>Home</div>; }"],
    ]);
    const filePaths = new Set(["app/page.tsx"]);
    const result = buildConsolidatedSource("app/page.tsx", contents, filePaths);
    expect(result).toContain("Home");
  });

  it("includes transitively imported components", () => {
    const contents = new Map([
      ["app/page.tsx", `import LoginForm from './components/LoginForm'; export default function Page() { return <LoginForm />; }`],
      ["app/components/LoginForm.tsx", `export default function LoginForm() { return <form onSubmit={handleSubmit}>Login</form>; }`],
    ]);
    const filePaths = new Set(["app/page.tsx", "app/components/LoginForm.tsx"]);
    const result = buildConsolidatedSource("app/page.tsx", contents, filePaths);
    expect(result).toContain("LoginForm");
    expect(result).toContain("handleSubmit");
  });

  it("handles nested imports (A → B → C)", () => {
    const contents = new Map([
      ["app/page.tsx", `import A from './A';`],
      ["app/A.tsx", `import B from './B';`],
      ["app/B.tsx", `export default function B() { return <div>Deep</div>; }`],
    ]);
    const filePaths = new Set(["app/page.tsx", "app/A.tsx", "app/B.tsx"]);
    const result = buildConsolidatedSource("app/page.tsx", contents, filePaths);
    expect(result).toContain("Deep");
  });

  it("handles circular imports without infinite loop", () => {
    const contents = new Map([
      ["app/page.tsx", `import A from './A';`],
      ["app/A.tsx", `import B from './B';`],
      ["app/B.tsx", `import A from './A';`],
    ]);
    const filePaths = new Set(["app/page.tsx", "app/A.tsx", "app/B.tsx"]);
    const result = buildConsolidatedSource("app/page.tsx", contents, filePaths);
    // Should not hang — just return what it can
    expect(result).toBeDefined();
  });
});

// ─── Fuzzy Accelerated Route Matcher tests ───────────────────────────────────

describe("extractRouteLikeStrings — route path literal extraction", () => {
  it("extracts path-like strings starting with /", () => {
    const source = `const x = "/billing/history";`;
    const result = extractRouteLikeStrings(source);
    expect(result).toContain("/billing/history");
  });

  it("extracts from template literals", () => {
    const source = 'const x = `/dashboard`;';
    const result = extractRouteLikeStrings(source);
    expect(result).toContain("/dashboard");
  });

  it("skips file paths with extensions", () => {
    const source = `const img = "/logo.png";`;
    const result = extractRouteLikeStrings(source);
    expect(result).not.toContain("/logo.png");
  });

  it("skips protocol URLs", () => {
    const source = `const url = "https://example.com";`;
    const result = extractRouteLikeStrings(source);
    expect(result).not.toContain("https://example.com");
  });

  it("deduplicates identical strings", () => {
    const source = `const a = "/billing"; const b = "/billing";`;
    const result = extractRouteLikeStrings(source);
    expect(result.filter((s) => s === "/billing")).toHaveLength(1);
  });
});

describe("fuzzyMatchRoute — fuzzy route matching", () => {
  it("matches exact routes", () => {
    expect(fuzzyMatchRoute("/billing", ["/billing", "/profile"])).toBe("/billing");
  });

  it("matches dynamic segment routes", () => {
    expect(fuzzyMatchRoute("/users/123", ["/users/:id"])).toBe("/users/:id");
  });

  it("matches by prefix", () => {
    expect(fuzzyMatchRoute("/billing/history", ["/billing"])).toBe("/billing");
  });

  it("matches by substring", () => {
    expect(fuzzyMatchRoute("/some/billing/path", ["/billing"])).toBe("/billing");
  });

  it("returns null for no match", () => {
    expect(fuzzyMatchRoute("/unknown", ["/billing"])).toBeNull();
  });

  it("skips root route for prefix matching", () => {
    expect(fuzzyMatchRoute("/anything", ["/"])).toBeNull();
  });
});

// ─── Full crawlRepository pipeline tests ─────────────────────────────────────

describe("crawlRepository — full pipeline", () => {
  it("creates Page View Nodes for discovered routes", () => {
    const files = ["app/page.tsx", "app/billing/page.tsx", "app/profile/page.tsx"];
    const contents = new Map([
      ["app/page.tsx", "export default function() { return <div>Home</div>; }"],
      ["app/billing/page.tsx", "export default function() { return <div>Billing</div>; }"],
      ["app/profile/page.tsx", "export default function() { return <div>Profile</div>; }"],
    ]);
    const graph = crawlRepository(files, contents);
    expect(graph.stats.pages).toBe(3);
    expect(graph.nodes.filter((n) => n.type === "page")).toHaveLength(3);
    expect(graph.nodes.filter((n) => n.type === "page").map((n) => n.label).sort()).toEqual([
      "/",
      "/billing",
      "/profile",
    ]);
  });

  it("marks dynamic route pages with dynamic flag", () => {
    const files = ["app/page.tsx", "app/users/[id]/page.tsx"];
    const contents = new Map([
      ["app/page.tsx", "export default function() { return <div>Home</div>; }"],
      ["app/users/[id]/page.tsx", "export default function() { return <div>User</div>; }"],
    ]);
    const graph = crawlRepository(files, contents);
    const dynamicPage = graph.nodes.find((n) => n.route === "/users/:id");
    expect(dynamicPage?.dynamic).toBe(true);
    const staticPage = graph.nodes.find((n) => n.route === "/");
    expect(staticPage?.dynamic).toBe(false);
  });

  it("creates directional wires for Link interactions between known routes", () => {
    const files = ["app/page.tsx", "app/billing/page.tsx"];
    const contents = new Map([
      ["app/page.tsx", `<Link href="/billing">Billing</Link>`],
      ["app/billing/page.tsx", "export default function() { return <div>Billing</div>; }"],
    ]);
    const graph = crawlRepository(files, contents);
    expect(graph.edges.length).toBeGreaterThanOrEqual(1);
    expect(graph.edges.some((e) => e.kind === "navigation")).toBe(true);
  });

  it("creates Action Nodes for onClick interactions", () => {
    const files = ["app/page.tsx", "app/billing/page.tsx"];
    const contents = new Map([
      ["app/page.tsx", `<button onClick={() => router.push("/billing")}>Go</button>`],
      ["app/billing/page.tsx", "export default function() { return <div>Billing</div>; }"],
    ]);
    const graph = crawlRepository(files, contents);
    expect(graph.nodes.some((n) => n.type === "action")).toBe(true);
    const actionEdges = graph.edges.filter((e) => e.kind === "action");
    expect(actionEdges.length).toBeGreaterThanOrEqual(1);
  });

  it("inserts Validation Diamond and fractures edge into Success/Failure paths", () => {
    const files = ["app/page.tsx", "app/billing/page.tsx"];
    const contents = new Map([
      ["app/page.tsx", `
        const schema = z.object({ email: z.string().email() });
        export default function Page() {
          const result = schema.safeParse(data);
          if (result.success) {
            return <Link href="/billing">Billing</Link>;
          }
        }
      `],
      ["app/billing/page.tsx", "export default function() { return <div>Billing</div>; }"],
    ]);
    const graph = crawlRepository(files, contents);

    const diamonds = graph.nodes.filter((n) => n.type === "validation");
    expect(diamonds.length).toBeGreaterThanOrEqual(1);
    expect(diamonds[0].shape).toBe("diamond");

    expect(graph.edges.some((e) => e.kind === "success")).toBe(true);
    expect(graph.edges.some((e) => e.kind === "failure")).toBe(true);
    expect(graph.edges.some((e) => e.label === "Success Path")).toBe(true);
    expect(graph.edges.some((e) => e.label === "Failure Path")).toBe(true);
  });

  it("does not create wires for interactions targeting unknown routes", () => {
    const files = ["app/page.tsx"];
    const contents = new Map([
      ["app/page.tsx", `<Link href="/external">External</Link>`],
    ]);
    const graph = crawlRepository(files, contents);
    expect(graph.edges).toHaveLength(0);
  });

  it("resolves dynamic route targets", () => {
    const files = ["app/page.tsx", "app/users/[id]/page.tsx"];
    const contents = new Map([
      ["app/page.tsx", `<Link href="/users/123">User 123</Link>`],
      ["app/users/[id]/page.tsx", "export default function() { return <div>User</div>; }"],
    ]);
    const graph = crawlRepository(files, contents);
    expect(graph.edges.some((e) => e.kind === "navigation")).toBe(true);
  });

  it("produces correct stats", () => {
    const files = ["app/page.tsx", "app/billing/page.tsx"];
    const contents = new Map([
      ["app/page.tsx", `
        const schema = z.object({ email: z.string() });
        <button onClick={() => router.push("/billing")}>Go</button>
      `],
      ["app/billing/page.tsx", "export default function() { return <div>Billing</div>; }"],
    ]);
    const graph = crawlRepository(files, contents);
    expect(graph.stats.pages).toBe(2);
    expect(graph.stats.validations).toBeGreaterThanOrEqual(1);
    expect(graph.stats.edges).toBeGreaterThanOrEqual(1);
  });

  it("captures interactions from imported child components", () => {
    const files = [
      "app/page.tsx",
      "app/billing/page.tsx",
      "app/components/LoginForm.tsx",
    ];
    const contents = new Map([
      ["app/page.tsx", `import LoginForm from './components/LoginForm';`],
      ["app/components/LoginForm.tsx", `export default function LoginForm() { return <Link href="/billing">Go to Billing</Link>; }`],
      ["app/billing/page.tsx", "export default function() { return <div>Billing</div>; }"],
    ]);
    const graph = crawlRepository(files, contents);
    // The Link inside LoginForm.tsx should be detected via consolidated source
    expect(graph.edges.some((e) => e.kind === "navigation")).toBe(true);
  });

  it("creates low-opacity reference edges via fuzzy matching", () => {
    const files = ["app/page.tsx", "app/billing/page.tsx"];
    const contents = new Map([
      ["app/page.tsx", `const route = "/billing"; console.log(route);`],
      ["app/billing/page.tsx", "export default function() { return <div>Billing</div>; }"],
    ]);
    const graph = crawlRepository(files, contents);
    // No explicit Link/router.push, but "/billing" appears as a string literal
    const refEdges = graph.edges.filter((e) => e.kind === "reference");
    expect(refEdges.length).toBeGreaterThanOrEqual(1);
    expect(refEdges[0].inferred).toBe(true);
  });

  it("does not create fuzzy reference edges when explicit navigation exists", () => {
    const files = ["app/page.tsx", "app/billing/page.tsx"];
    const contents = new Map([
      ["app/page.tsx", `<Link href="/billing">Billing</Link>`],
      ["app/billing/page.tsx", "export default function() { return <div>Billing</div>; }"],
    ]);
    const graph = crawlRepository(files, contents);
    expect(graph.edges.some((e) => e.kind === "reference")).toBe(false);
  });
});
