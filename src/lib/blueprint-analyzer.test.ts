import { describe, expect, it } from "vitest";
import {
  analyzeBlueprint,
  detectRoutes,
  detectControllers,
  detectValidation,
  detectApiCalls,
  detectDatabases,
  type DetectedRoute,
} from "./blueprint-analyzer";
import { layoutBlueprint } from "./system-blueprint";
import { parseModule } from "./ast-parser";
import { NODE_W, NODE_H } from "./canvas-geometry";

// ─── Fixture sources ────────────────────────────────────────────────────────

const LOGIN_PAGE = `
import { z } from "zod";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export default function LoginPage() {
  async function onSubmit(e) {
    e.preventDefault();
    const parsed = schema.safeParse(form);
    if (!parsed.success) return;
    const res = await fetch("/api/auth", { method: "POST" });
    if (!res.ok) throw new Error("Login failed");
  }
  return <form />;
}
`;

const AUTH_ROUTE = `
import { supabase } from "@/lib/supabase";

export async function POST(request) {
  const { email } = await request.json();
  const { data, error } = await supabase.from("profiles").select("*").eq("email", email);
  if (error) return new Response("error", { status: 500 });
  return Response.json({ user: data });
}
`;

const REGISTER_PAGE = `
import * as yup from "yup";

const schema = yup.object({
  email: yup.string().email().required(),
  password: yup.string().min(8).required(),
});

export default function RegisterPage() {
  async function handleSubmit(e) {
    e.preventDefault();
    await schema.validate(form);
    await axios.post("/api/register", form);
  }
  return <form />;
}
`;

const REGISTER_ROUTE = `
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

export async function POST(req) {
  const body = await req.json();
  const user = await prisma.user.create({ data: body });
  return Response.json(user);
}
`;

const DASHBOARD_PAGE = `
export default function DashboardPage() {
  const { data } = useSWR("/api/profile");
  if (!data) return <Loading />;
  return <Dashboard data={data} />;
}
`;

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("route detection", () => {
  it("detects Next.js App Router page routes", () => {
    const mod = parseModule(LOGIN_PAGE, "app/auth/login/page.tsx");
    const routes = detectRoutes([mod]);
    expect(routes).toHaveLength(1);
    expect(routes[0].key).toBe("/auth/login");
    expect(routes[0].router).toBe("app-router");
  });

  it("detects the root App Router page", () => {
    const mod = parseModule("<div>home</div>", "app/page.tsx");
    const routes = detectRoutes([mod]);
    expect(routes.some((r) => r.key === "/")).toBe(true);
  });

  it("detects dynamic App Router segments as :param", () => {
    const mod = parseModule("<div/>", "app/users/[id]/page.tsx");
    const routes = detectRoutes([mod]);
    expect(routes[0].key).toBe("/users/:param");
  });

  it("strips route groups from App Router paths", () => {
    const mod = parseModule("<div/>", "app/(auth)/login/page.tsx");
    const routes = detectRoutes([mod]);
    expect(routes[0].key).toBe("/login");
  });

  it("detects Pages Router routes", () => {
    const mod = parseModule("<div/>", "pages/dashboard.tsx");
    const routes = detectRoutes([mod]);
    expect(routes[0].key).toBe("/dashboard");
    expect(routes[0].router).toBe("pages-router");
  });

  it("ignores Pages Router special files and api routes", () => {
    const mods = [
      parseModule("<div/>", "pages/_app.tsx"),
      parseModule("<div/>", "pages/_document.tsx"),
      parseModule("<div/>", "pages/api/auth.ts"),
    ];
    const routes = detectRoutes(mods);
    expect(routes).toHaveLength(0);
  });
});

describe("validation detection", () => {
  it("detects Zod schemas", () => {
    const mod = parseModule(LOGIN_PAGE, "app/auth/login/page.tsx");
    const v = detectValidation(mod);
    expect(v).not.toBeNull();
    expect(v!.kind).toBe("zod");
  });

  it("detects Yup schemas", () => {
    const mod = parseModule(REGISTER_PAGE, "app/register/page.tsx");
    const v = detectValidation(mod);
    expect(v).not.toBeNull();
    expect(v!.kind).toBe("yup");
  });

  it("returns null when no validation is present", () => {
    const mod = parseModule("export default () => <div/>", "app/home/page.tsx");
    expect(detectValidation(mod)).toBeNull();
  });
});

describe("API call detection", () => {
  it("detects fetch calls with method", () => {
    const mod = parseModule(LOGIN_PAGE, "app/auth/login/page.tsx");
    const calls = detectApiCalls(mod);
    expect(calls.some((c) => c.endpoint === "/api/auth" && c.method === "POST")).toBe(true);
  });

  it("detects axios calls", () => {
    const mod = parseModule(REGISTER_PAGE, "app/register/page.tsx");
    const calls = detectApiCalls(mod);
    expect(calls.some((c) => c.endpoint === "/api/register" && c.method === "POST")).toBe(true);
  });

  it("detects useSWR calls as GET", () => {
    const mod = parseModule(DASHBOARD_PAGE, "app/dashboard/page.tsx");
    const calls = detectApiCalls(mod);
    expect(calls.some((c) => c.endpoint === "/api/profile" && c.method === "GET")).toBe(true);
  });
});

describe("controller detection", () => {
  it("detects App Router route handlers and their HTTP methods", () => {
    const mod = parseModule(AUTH_ROUTE, "app/api/auth/route.ts");
    const ctrls = detectControllers([mod]);
    expect(ctrls).toHaveLength(1);
    expect(ctrls[0].key).toBe("/api/auth");
    expect(ctrls[0].methods).toContain("POST");
  });

  it("detects Pages Router API routes", () => {
    const mod = parseModule("export default function handler(req,res){}", "pages/api/auth.ts");
    const ctrls = detectControllers([mod]);
    expect(ctrls[0].key).toBe("/api/auth");
  });
});

describe("database detection", () => {
  it("detects Supabase .from() table references", () => {
    const mod = parseModule(AUTH_ROUTE, "app/api/auth/route.ts");
    const dbs = detectDatabases(mod);
    expect(dbs.some((d) => d.label === "profiles" && d.client === "supabase")).toBe(true);
  });

  it("detects Prisma model calls", () => {
    const mod = parseModule(REGISTER_ROUTE, "app/api/register/route.ts");
    const dbs = detectDatabases(mod);
    expect(dbs.some((d) => d.label === "user" && d.client === "prisma")).toBe(true);
  });
});

// ─── End-to-end blueprint assembly ─────────────────────────────────────────

describe("analyzeBlueprint — end-to-end pipeline", () => {
  const modules = [
    parseModule(LOGIN_PAGE, "app/auth/login/page.tsx"),
    parseModule(AUTH_ROUTE, "app/api/auth/route.ts"),
    parseModule(REGISTER_PAGE, "app/register/page.tsx"),
    parseModule(REGISTER_ROUTE, "app/api/register/route.ts"),
    parseModule(DASHBOARD_PAGE, "app/dashboard/page.tsx"),
  ];

  const bp = analyzeBlueprint(modules);

  it("emits a View node per route", () => {
    const views = bp.nodes.filter((n) => n.type === "view");
    expect(views.map((n) => n.label).sort()).toEqual([
      "/auth/login",
      "/dashboard",
      "/register",
    ]);
    for (const v of views) {
      expect(v.shape).toBe("pill");
      expect(v.accent).toBe("green");
    }
  });

  it("emits a Validation diamond for pages with validation", () => {
    const vals = bp.nodes.filter((n) => n.type === "validation");
    // login (zod) + register (yup) + dashboard (custom `if (!data)` guard)
    expect(vals).toHaveLength(3);
    for (const v of vals) {
      expect(v.shape).toBe("diamond");
      expect(v.accent).toBe("purple");
    }
  });

  it("emits a Controller rectangle per API route", () => {
    const ctrls = bp.nodes.filter((n) => n.type === "controller");
    expect(ctrls.map((n) => n.label).sort()).toEqual(["/api/auth", "/api/register"]);
    for (const c of ctrls) {
      expect(c.shape).toBe("rectangle");
      expect(c.accent).toBe("teal");
    }
  });

  it("emits a Database cylinder per detected table", () => {
    const dbs = bp.nodes.filter((n) => n.type === "database");
    expect(dbs.map((n) => n.label).sort()).toEqual(["profiles", "user"]);
    for (const d of dbs) {
      expect(d.shape).toBe("cylinder");
      expect(d.accent).toBe("blue");
    }
  });

  it("links View → Validation → Controller → Database with Success branches", () => {
    const idByKey = new Map(bp.nodes.map((n) => [n.key, n.id]));
    const edgeBetween = (fromKey: string, toKey: string, label?: string) =>
      bp.edges.some(
        (e) =>
          e.from === idByKey.get(fromKey) &&
          e.to === idByKey.get(toKey) &&
          (label === undefined || e.label === label)
      );

    // /auth/login → validate → /api/auth (Success) → profiles
    expect(edgeBetween("/auth/login", "val:app/auth/login/page.tsx")).toBe(true);
    expect(
      edgeBetween("val:app/auth/login/page.tsx", "/api/auth", "Success")
    ).toBe(true);
    expect(edgeBetween("/api/auth", "supabase:profiles")).toBe(true);

    // /register → validate → /api/register (Success) → user
    expect(edgeBetween("/register", "val:app/register/page.tsx")).toBe(true);
    expect(
      edgeBetween("val:app/register/page.tsx", "/api/register", "Success")
    ).toBe(true);
    expect(edgeBetween("/api/register", "prisma:user")).toBe(true);
  });

  it("emits a Failure branch from validation to an error node", () => {
    const errNodes = bp.nodes.filter((n) => n.type === "error");
    expect(errNodes.length).toBeGreaterThan(0);
    for (const e of errNodes) {
      expect(e.shape).toBe("triangle");
      expect(e.accent).toBe("red");
    }
    // at least one Failure-labeled edge exists
    expect(bp.edges.some((e) => e.label === "Failure")).toBe(true);
  });

  it("stats summarize the four node categories", () => {
    expect(bp.stats.routes).toBe(3);
    expect(bp.stats.validations).toBe(3);
    expect(bp.stats.controllers).toBe(2);
    expect(bp.stats.databases).toBe(2);
  });
});

// ─── Layout engine ─────────────────────────────────────────────────────────

describe("layoutBlueprint — left-to-right user-journey timeline", () => {
  const modules = [
    parseModule(LOGIN_PAGE, "app/auth/login/page.tsx"),
    parseModule(AUTH_ROUTE, "app/api/auth/route.ts"),
  ];
  const bp = analyzeBlueprint(modules);
  const layout = layoutBlueprint(bp);

  it("places views in the leftmost column", () => {
    const view = layout.nodes.find((n) => n.type === "view")!;
    expect(view.x).toBeLessThan(
      layout.nodes.find((n) => n.type === "validation")!.x
    );
  });

  it("places validation to the right of the view", () => {
    const view = layout.nodes.find((n) => n.type === "view")!;
    const val = layout.nodes.find((n) => n.type === "validation")!;
    expect(val.x).toBeGreaterThan(view.x);
  });

  it("places controller to the right of validation", () => {
    const val = layout.nodes.find((n) => n.type === "validation")!;
    const ctrl = layout.nodes.find((n) => n.type === "controller")!;
    expect(ctrl.x).toBeGreaterThan(val.x);
  });

  it("places database in the rightmost column", () => {
    const ctrl = layout.nodes.find((n) => n.type === "controller")!;
    const db = layout.nodes.find((n) => n.type === "database")!;
    expect(db.x).toBeGreaterThan(ctrl.x);
  });

  it("aligns the connected journey on the same row", () => {
    const view = layout.nodes.find((n) => n.type === "view")!;
    const val = layout.nodes.find((n) => n.type === "validation")!;
    const ctrl = layout.nodes.find((n) => n.type === "controller")!;
    const db = layout.nodes.find((n) => n.type === "database")!;
    expect(val.y).toBeCloseTo(view.y, 5);
    expect(ctrl.y).toBeCloseTo(view.y, 5);
    expect(db.y).toBeCloseTo(view.y, 5);
  });

  it("assigns east/west handles for left-to-right flow", () => {
    const successEdge = layout.edges.find((e) => e.label === "Success");
    expect(successEdge).toBeDefined();
    expect(successEdge!.fromHandle).toBe("e");
    expect(successEdge!.toHandle).toBe("w");
  });

  it("assigns south/north handles for Failure branches", () => {
    const failEdge = layout.edges.find((e) => e.label === "Failure");
    expect(failEdge).toBeDefined();
    expect(failEdge!.fromHandle).toBe("s");
    expect(failEdge!.toHandle).toBe("n");
  });

  it("produces non-overlapping node positions", () => {
    const positions = layout.nodes.map((n) => ({ x: n.x, y: n.y }));
    const keys = new Set(positions.map((p) => `${p.x},${p.y}`));
    expect(keys.size).toBe(positions.length);
  });

  it("every node fits within the canvas footprint", () => {
    for (const n of layout.nodes) {
      expect(n.x).toBeGreaterThanOrEqual(0);
      expect(n.y).toBeGreaterThanOrEqual(0);
      expect(n.w ?? NODE_W).toBeGreaterThan(0);
      expect(n.h ?? NODE_H).toBeGreaterThan(0);
    }
  });
});
