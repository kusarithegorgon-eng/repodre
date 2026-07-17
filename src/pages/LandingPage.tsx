import { GitBranch, Database, ShieldCheck, ArrowRight, ArrowDown } from "lucide-react";
import { signInWithGitHub } from "@/lib/github-auth";
import { RepodreLogo } from "@/components/RepodreLogo";
import { Hero3D } from "@/components/Hero3D";

const FEATURES = [
  {
    icon: GitBranch,
    node: "controller" as const,
    title: "Repository automation",
    body: "Paste a GitHub URL and Repodre traces every request through your codebase, turning execution paths into a readable flowchart.",
  },
  {
    icon: Database,
    node: "database" as const,
    title: "ERD blueprinting",
    body: "Repodre reads your schema and renders table relationships in Crow's Foot notation — no manual diagramming.",
  },
  {
    icon: ShieldCheck,
    node: "view" as const,
    title: "Privacy-first by design",
    body: "Parsing happens in your browser. Your source is never uploaded to or stored on a Repodre server.",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Connect a repository",
    body: "Sign in with GitHub and point Repodre at any repo you can already access.",
  },
  {
    n: "02",
    title: "Repodre parses it locally",
    body: "Routes, controllers, and schema are analyzed in your browser as the diagram builds.",
  },
  {
    n: "03",
    title: "Explore the diagram",
    body: "Follow execution flow and table relationships, zoom in on a module, or export the view.",
  },
];

// Node color tokens are pulled from the same CSS variables the diagram
// canvas uses (see index.css), so the hero preview matches the real product.
const NODE_STYLES = {
  view: { fill: "var(--node-view-fill)", stroke: "var(--node-view-stroke)", text: "var(--node-view-text)" },
  controller: { fill: "var(--node-controller-fill)", stroke: "var(--node-controller-stroke)", text: "var(--node-controller-text)" },
  database: { fill: "var(--node-database-fill)", stroke: "var(--node-database-stroke)", text: "var(--node-database-text)" },
};

function HeroDiagram() {
  const nodeW = 208;
  const nodeH = 50;
  const x = 56;
  const rows = [
    { y: 16, label: "HomePage.tsx", sub: "view", node: NODE_STYLES.view },
    { y: 108, label: "GET /api/repos", sub: "controller", node: NODE_STYLES.controller },
    { y: 200, label: "repos", sub: "database", node: NODE_STYLES.database },
  ];

  return (
    <div className="grid-canvas relative overflow-hidden rounded-2xl border border-border p-6 mx-auto max-w-[420px]">
      <svg viewBox="0 0 320 280" className="w-full h-auto max-h-[320px]" role="img" aria-label="Preview of a Repodre execution-flow diagram">
        {rows.slice(0, -1).map((row, i) => {
          const next = rows[i + 1];
          const midY = (row.y + nodeH + next.y) / 2;
          return (
            <g key={i}>
              <path
                d={`M ${x + nodeW / 2} ${row.y + nodeH} V ${next.y}`}
                className="wire-primary repodre-traffic-flow"
                strokeDasharray="6 6"
              />
              <path
                d={`M ${x + nodeW / 2 - 5} ${next.y - 8} L ${x + nodeW / 2} ${next.y - 1} L ${x + nodeW / 2 + 5} ${next.y - 8}`}
                fill="none"
                stroke="var(--wire-primary)"
                strokeWidth="2"
              />
              <text
                x={x + nodeW + 14}
                y={midY + 4}
                className="font-mono"
                fontSize="10"
                fill="var(--muted-foreground)"
              >
                {i === 0 ? "GET /repos" : "SELECT *"}
              </text>
            </g>
          );
        })}

        {rows.map((row, i) => (
          <g key={i}>
            <rect
              x={x}
              y={row.y}
              width={nodeW}
              height={nodeH}
              rx={8}
              fill={row.node.fill}
              stroke={row.node.stroke}
              strokeWidth="1.5"
            />
            <text x={x + 14} y={row.y + 21} fontSize="13" fontWeight="600" fill={row.node.text}>
              {row.label}
            </text>
            <text x={x + 14} y={row.y + 37} className="font-mono" fontSize="10" fill={row.node.text} opacity="0.75">
              {row.sub}
            </text>
          </g>
        ))}
      </svg>

      <div className="pointer-events-none absolute left-6 top-4 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        live preview
      </div>
    </div>
  );
}

export function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <RepodreLogo width={36} height={36} />
            <span className="text-lg font-semibold">Repodre</span>
          </div>
          <nav className="hidden items-center gap-8 md:flex">
            <a href="#features" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
              Features
            </a>
            <a href="#how-it-works" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
              How it works
            </a>
          </nav>
          <button
            onClick={() => signInWithGitHub()}
            className="rounded-md bg-teal px-4 py-2 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
          >
            Sign in
          </button>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="mx-auto max-w-6xl px-6 pb-20 pt-20 md:pt-28">
          <div className="grid grid-cols-1 items-center gap-16 md:grid-cols-2">
            <div className="max-w-xl">
              <p className="font-mono text-xs uppercase tracking-widest text-teal">
                GitHub repository visualizer
              </p>
              <h1 className="mt-4 text-4xl font-extrabold leading-[1.1] tracking-tight md:text-5xl">
                See the architecture GitHub won&apos;t show you.
              </h1>
              <p className="mt-6 text-lg leading-relaxed text-muted-foreground">
                Point Repodre at a repository and it traces execution flow and maps your
                database schema, rendered as a diagram — parsed entirely in your browser.
              </p>
              <div className="mt-10 flex flex-wrap items-center gap-4">
                <button
                  onClick={() => signInWithGitHub()}
                  className="inline-flex items-center gap-2 rounded-lg bg-teal px-6 py-3 text-base font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
                >
                  Get started with GitHub
                  <ArrowRight className="h-4 w-4" />
                </button>
                <a
                  href="#how-it-works"
                  className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  See how it works
                  <ArrowDown className="h-3.5 w-3.5" />
                </a>
              </div>
              <p className="mt-6 text-sm text-muted-foreground">
                Works with any repository your GitHub account can already access.
              </p>
            </div>

            <Hero3D />
          </div>
        </section>

        {/* Features */}
        <section id="features" className="border-t border-border bg-surface">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <h2 className="text-2xl font-bold md:text-3xl">Built for reading code, not just storing it</h2>
            <p className="mt-3 max-w-2xl text-muted-foreground">
              Three views into a repository that would otherwise take an afternoon of
              file-hopping to piece together.
            </p>

            <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
              {FEATURES.map(({ icon: Icon, node, title, body }) => {
                const style = NODE_STYLES[node];
                return (
                  <div
                    key={title}
                    className="rounded-xl border border-border bg-background p-6"
                    style={{ borderLeft: `3px solid ${style.stroke}` }}
                  >
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-lg"
                      style={{ background: style.fill }}
                    >
                      <Icon className="h-5 w-5" style={{ color: style.stroke }} />
                    </div>
                    <h3 className="mt-5 text-lg font-semibold">{title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="text-2xl font-bold md:text-3xl">From URL to diagram in three steps</h2>

          <div className="mt-12 grid grid-cols-1 gap-10 md:grid-cols-3">
            {STEPS.map((step) => (
              <div key={step.n}>
                <span className="font-mono text-sm font-semibold text-teal">{step.n}</span>
                <h3 className="mt-3 text-lg font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA band */}
        <section className="border-y border-border bg-surface">
          <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-6 py-14 md:flex-row md:items-center">
            <div>
              <h2 className="text-2xl font-bold">Ready to see your own repository mapped out?</h2>
              <p className="mt-2 text-muted-foreground">Sign in with GitHub — it takes about a minute.</p>
            </div>
            <button
              onClick={() => signInWithGitHub()}
              className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-teal px-6 py-3 text-base font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
            >
              Get started with GitHub
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </section>

        {/* Footer */}
        <footer className="mx-auto max-w-6xl px-6 py-14">
          <div className="flex flex-col gap-10 md:flex-row md:justify-between">
            <div className="flex items-center gap-3">
              <RepodreLogo width={36} height={36} />
              <span className="font-semibold">Repodre</span>
            </div>
            <div className="flex gap-16">
              <div>
                <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Product</p>
                <ul className="mt-3 space-y-2 text-sm">
                  <li><a href="#features" className="text-muted-foreground hover:text-foreground">Features</a></li>
                  <li><a href="#how-it-works" className="text-muted-foreground hover:text-foreground">How it works</a></li>
                </ul>
              </div>
              <div>
                <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Legal</p>
                <ul className="mt-3 space-y-2 text-sm">
                  <li><a href="/privacy" className="text-muted-foreground hover:text-foreground">Privacy Policy</a></li>
                  <li><a href="/terms" className="text-muted-foreground hover:text-foreground">Terms of Service</a></li>
                </ul>
              </div>
            </div>
          </div>
          <p className="mt-12 border-t border-border pt-6 text-xs text-muted-foreground">
            © {new Date().getFullYear()} Repodre.
          </p>
        </footer>
      </main>
    </div>
  );
}