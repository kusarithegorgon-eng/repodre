import { describe, it, expect } from "vitest";
import { buildJourneyGraph } from "./journey-flow-builder";
import type { ParsedModule } from "./ast-parser";

function mod(path: string, source: string): ParsedModule {
  return { path, source, exports: [], imports: [], calls: [] };
}

describe("buildJourneyGraph", () => {
  it("always creates Start, Landing, and End nodes even with no modules", () => {
    const graph = buildJourneyGraph([]);

    const types = graph.nodes.map((n) => n.type);
    expect(types).toContain("start");
    expect(types).toContain("page"); // landing
    expect(types).toContain("end");
  });

  it("creates a Start → Landing edge", () => {
    const graph = buildJourneyGraph([]);
    const start = graph.nodes.find((n) => n.type === "start")!;
    const landing = graph.nodes.find((n) => n.type === "page")!;

    const edge = graph.edges.find((e) => e.from === start.id && e.to === landing.id);
    expect(edge).toBeDefined();
  });

  it("loops End → Landing (no dead-end)", () => {
    const graph = buildJourneyGraph([]);
    const end = graph.nodes.find((n) => n.type === "end")!;
    const landing = graph.nodes.find((n) => n.type === "page")!;

    const loopEdge = graph.edges.find((e) => e.from === end.id && e.to === landing.id);
    expect(loopEdge).toBeDefined();
    expect(loopEdge!.label).toBe("restart");
  });

  it("detects auth login from file content", () => {
    const graph = buildJourneyGraph([
      mod("app/login/page.tsx", "export default function Login() { return signIn() }"),
    ]);

    expect(graph.nodes.some((n) => n.type === "auth")).toBe(true);
  });

  it("detects logout from file content", () => {
    const graph = buildJourneyGraph([
      mod("app/logout/page.tsx", "export default function Logout() { return signOut() }"),
    ]);

    expect(graph.nodes.some((n) => n.type === "logout")).toBe(true);
  });

  it("detects validation (zod schema)", () => {
    const graph = buildJourneyGraph([
      mod("lib/validate.ts", "const schema = z.object({ email: z.string() })"),
    ]);

    expect(graph.nodes.some((n) => n.type === "validation")).toBe(true);
  });

  it("detects API action nodes", () => {
    const graph = buildJourneyGraph([
      mod("api/users/route.ts", "export async function GET(req) { return Response.json({}) }"),
    ]);

    expect(graph.nodes.some((n) => n.type === "action")).toBe(true);
  });

  it("detects database nodes", () => {
    const graph = buildJourneyGraph([
      mod("lib/prisma.ts", "import { prisma } from '@prisma/client'"),
    ]);

    expect(graph.nodes.some((n) => n.type === "database")).toBe(true);
  });

  it("detects user decisions from router.push", () => {
    const graph = buildJourneyGraph([
      mod("app/dashboard/page.tsx", "router.push('/settings'); router.push('/profile')"),
    ]);

    const decisions = graph.nodes.filter((n) => n.type === "decision");
    expect(decisions.length).toBeGreaterThan(0);
  });

  it("connects Landing → Auth when auth is detected", () => {
    const graph = buildJourneyGraph([
      mod("app/login/page.tsx", "export default function Login() { return signIn() }"),
    ]);

    const landing = graph.nodes.find((n) => n.type === "page")!;
    const auth = graph.nodes.find((n) => n.type === "auth")!;

    const edge = graph.edges.find((e) => e.from === landing.id && e.to === auth.id);
    expect(edge).toBeDefined();
  });

  it("connects Auth → Validation (credential check)", () => {
    const graph = buildJourneyGraph([
      mod("app/login/page.tsx", "export default function Login() { const s = z.object({email: z.string()}); signIn() }"),
    ]);

    const auth = graph.nodes.find((n) => n.type === "auth")!;
    const validation = graph.nodes.find((n) => n.type === "validation")!;

    const edge = graph.edges.find((e) => e.from === auth.id && e.to === validation.id);
    expect(edge).toBeDefined();
  });

  it("connects Logout → End → Landing (loop)", () => {
    const graph = buildJourneyGraph([
      mod("app/logout/page.tsx", "export default function Logout() { signOut() }"),
    ]);

    const logout = graph.nodes.find((n) => n.type === "logout")!;
    const end = graph.nodes.find((n) => n.type === "end")!;
    const landing = graph.nodes.find((n) => n.type === "page")!;

    const toEnd = graph.edges.find((e) => e.from === logout.id && e.to === end.id);
    const toLanding = graph.edges.find((e) => e.from === end.id && e.to === landing.id);
    expect(toEnd).toBeDefined();
    expect(toLanding).toBeDefined();
  });

  it("ensures every non-start node has at least one incoming edge", () => {
    const graph = buildJourneyGraph([
      mod("app/login/page.tsx", "signIn()"),
      mod("api/users/route.ts", "export async function GET() {}"),
      mod("lib/prisma.ts", "import { prisma } from '@prisma/client'"),
      mod("app/logout/page.tsx", "signOut()"),
    ]);

    const incoming = new Set(graph.edges.map((e) => e.to));
    for (const node of graph.nodes) {
      if (node.type === "start") continue;
      expect(incoming.has(node.id)).toBe(true);
    }
  });

  it("ensures every non-end node has at least one outgoing edge", () => {
    const graph = buildJourneyGraph([
      mod("app/login/page.tsx", "signIn()"),
      mod("api/users/route.ts", "export async function GET() {}"),
      mod("lib/prisma.ts", "import { prisma } from '@prisma/client'"),
      mod("app/logout/page.tsx", "signOut()"),
    ]);

    const outgoing = new Set(graph.edges.map((e) => e.from));
    for (const node of graph.nodes) {
      if (node.type === "end") continue;
      expect(outgoing.has(node.id)).toBe(true);
    }
  });

  it("assigns distinct shapes to different node types", () => {
    const graph = buildJourneyGraph([
      mod("app/login/page.tsx", "signIn()"),
      mod("lib/validate.ts", "z.object({})"),
      mod("api/users/route.ts", "export async function GET() {}"),
      mod("lib/prisma.ts", "prisma"),
      mod("app/logout/page.tsx", "signOut()"),
    ]);

    const shapesByType = new Map<string, string>();
    for (const n of graph.nodes) {
      if (!shapesByType.has(n.type)) shapesByType.set(n.type, n.shape);
    }

    // Start and End should be pill, auth should be diamond, db should be cylinder
    expect(shapesByType.get("start")).toBe("pill");
    expect(shapesByType.get("auth")).toBe("diamond");
    expect(shapesByType.get("validation")).toBe("diamond");
    expect(shapesByType.get("database")).toBe("cylinder");
    expect(shapesByType.get("action")).toBe("rectangle");
  });

  it("builds a full journey: Start → Landing → Auth → Validation → Action → DB → Logout → End → Landing", () => {
    const graph = buildJourneyGraph([
      mod("app/page.tsx", "export default function Home() {}"),
      mod("app/login/page.tsx", "signIn(); z.object({email: z.string()})"),
      mod("api/users/route.ts", "export async function GET() { return prisma.user.findMany() }"),
      mod("lib/prisma.ts", "import { prisma } from '@prisma/client'"),
      mod("app/logout/page.tsx", "signOut()"),
    ]);

    const types = graph.nodes.map((n) => n.type);
    expect(types).toContain("start");
    expect(types).toContain("page");
    expect(types).toContain("auth");
    expect(types).toContain("validation");
    expect(types).toContain("action");
    expect(types).toContain("database");
    expect(types).toContain("logout");
    expect(types).toContain("end");

    // The graph should have a path from start to end
    expect(graph.edges.length).toBeGreaterThanOrEqual(8);
  });

  it("generates 'auth profile created' DB node when register flow is detected", () => {
    const graph = buildJourneyGraph([
      mod("app/register/page.tsx", "export default function Register() { signIn(); register() }"),
      mod("api/auth/route.ts", "export async function POST() { return prisma.user.create() }"),
    ]);

    const dbNode = graph.nodes.find((n) => n.type === "database" && n.label === "auth profile created");
    expect(dbNode).toBeDefined();
  });

  it("generates 'project stored' DB node when project creation is detected", () => {
    const graph = buildJourneyGraph([
      mod("app/projects/new/page.tsx", "export default function NewProject() { createProject() }"),
      mod("api/projects/route.ts", "export async function POST() { return prisma.project.create() }"),
    ]);

    const dbNode = graph.nodes.find((n) => n.type === "database" && n.label === "project stored");
    expect(dbNode).toBeDefined();
  });

  it("connects storage action edges with descriptive labels", () => {
    const graph = buildJourneyGraph([
      mod("app/register/page.tsx", "export default function Register() { signIn(); register() }"),
      mod("api/auth/route.ts", "export async function POST() { return prisma.user.create() }"),
    ]);

    const storageEdge = graph.edges.find((e) => e.label === "store profile");
    expect(storageEdge).toBeDefined();
  });

  it("generates 'post stored' for blog post creation", () => {
    const graph = buildJourneyGraph([
      mod("app/posts/new/page.tsx", "export default function NewPost() { createPost(); publish() }"),
      mod("api/posts/route.ts", "export async function POST() { return prisma.post.create() }"),
    ]);

    const dbNode = graph.nodes.find((n) => n.type === "database" && n.label === "post stored");
    expect(dbNode).toBeDefined();
  });

  it("generates 'order stored' for order placement", () => {
    const graph = buildJourneyGraph([
      mod("app/checkout/page.tsx", "export default function Checkout() { placeOrder(); submit() }"),
      mod("api/orders/route.ts", "export async function POST() { return prisma.order.create() }"),
    ]);

    const dbNode = graph.nodes.find((n) => n.type === "database" && n.label === "order stored");
    expect(dbNode).toBeDefined();
  });

  it("generates 'profile updated' for profile update flow", () => {
    const graph = buildJourneyGraph([
      mod("app/profile/edit/page.tsx", "export default function EditProfile() { updateProfile() }"),
      mod("api/profile/route.ts", "export async function PUT() { return prisma.profile.update() }"),
    ]);

    const dbNode = graph.nodes.find((n) => n.type === "database" && n.label === "profile updated");
    expect(dbNode).toBeDefined();
  });

  it("generates generic 'record stored' for unrecognized CRUD create", () => {
    const graph = buildJourneyGraph([
      mod("api/widgets/route.ts", "export async function PUT() { return prisma.widget.add() }"),
    ]);

    const dbNode = graph.nodes.find((n) => n.type === "database" && n.label === "record stored");
    expect(dbNode).toBeDefined();
  });

  it("ensures storage DB nodes are connected (no orphans)", () => {
    const graph = buildJourneyGraph([
      mod("app/register/page.tsx", "export default function Register() { signIn(); register() }"),
      mod("api/auth/route.ts", "export async function POST() { return prisma.user.create() }"),
    ]);

    const storageDb = graph.nodes.find((n) => n.type === "database" && n.label === "auth profile created");
    expect(storageDb).toBeDefined();

    // Must have at least one incoming edge
    const incoming = graph.edges.filter((e) => e.to === storageDb!.id);
    expect(incoming.length).toBeGreaterThan(0);

    // Must have at least one outgoing edge (orphan insurance)
    const outgoing = graph.edges.filter((e) => e.from === storageDb!.id);
    expect(outgoing.length).toBeGreaterThan(0);
  });
});
