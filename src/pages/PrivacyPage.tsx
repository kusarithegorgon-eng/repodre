import { Link } from "@tanstack/react-router";
import { Shield, Lock, Eye, EyeOff, ArrowLeft } from "lucide-react";
import { RepodreLogo } from "@/components/RepodreLogo";
import { ThemeToggle } from "@/components/ThemeToggle";

export function PrivacyPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="flex h-14 items-center justify-between border-b border-border px-6">
        <Link to="/" className="flex items-center gap-2.5">
          <RepodreLogo className="h-8 w-8" />
          <span className="font-display text-sm font-semibold tracking-tight">Repodre</span>
        </Link>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link
            to="/"
            className="flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-xs font-medium hover:border-teal hover:text-teal"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl flex-1 px-6 py-12">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-teal/10">
            <Shield className="h-6 w-6 text-teal" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Privacy Policy</h1>
            <p className="text-sm text-muted-foreground">Last updated: July 2, 2026</p>
          </div>
        </div>

        <div className="prose prose-sm dark:prose-invert max-w-none space-y-6 text-sm leading-relaxed text-muted-foreground">
          <section>
            <h2 className="mb-2 text-lg font-semibold text-foreground">1. Zero-Knowledge Architecture</h2>
            <p>
              Repodre operates on a strict zero-knowledge privacy model. All repository parsing
              and source code analysis happens <strong className="text-foreground">entirely locally
              in your browser's memory sandbox zones</strong>. Your source code, file contents,
              and parsed AST structures are never transmitted to, stored on, or processed by
              any external server.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold text-foreground">2. What We Do Not Collect</h2>
            <ul className="ml-4 list-disc space-y-1">
              <li>Source code or file contents from analyzed repositories</li>
              <li>Parsed AST structures or intermediate analysis artifacts</li>
              <li>Repository URLs beyond the immediate browser session</li>
              <li>Personal code snippets or schema definitions</li>
              <li>Analytics, telemetry, or usage tracking data</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold text-foreground">3. What We Store</h2>
            <p>
              When you save a project to your workspace, only the following structural metadata
              is persisted to our Supabase database:
            </p>
            <ul className="ml-4 list-disc space-y-1">
              <li>Node labels, shapes, and positions (the visual diagram layout)</li>
              <li>Edge connections between nodes</li>
              <li>Project names and descriptions you provide</li>
              <li>GitHub authentication tokens (for repository access only)</li>
            </ul>
            <p className="mt-2">
              No source code is ever stored. The diagram metadata contains only the labels and
              shapes you see on the canvas — not the underlying code that generated them.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold text-foreground">4. GitHub Authentication</h2>
            <p>
              When you sign in with GitHub, we request read-only access to repository contents
              for the purpose of fetching files for analysis. This access token is stored
              locally in your browser and is used solely to fetch repository files into your
              browser's memory for client-side parsing.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold text-foreground">5. No Tracking</h2>
            <p>
              Repodre does not use any analytics scripts, marketing trackers, cookies, or
              fingerprinting technologies. We do not track your usage patterns, page views,
              or interactions. There are no cookie banners because there are no cookies
              (other than the essential session token for authentication).
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold text-foreground">6. Data Retention</h2>
            <p>
              Saved project diagrams remain in your account until you delete them. If you do
              not save a project, all analysis data is cleared from browser memory when you
              navigate away or close the tab. Unsaved analysis data is never persisted.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold text-foreground">7. Contact</h2>
            <p>
              For privacy questions or data deletion requests, please open an issue on our
              GitHub repository.
            </p>
          </section>
        </div>

        <div className="mt-12 flex items-center gap-2 rounded-lg border border-teal/20 bg-teal/5 p-4">
          <Lock className="h-5 w-5 shrink-0 text-teal" />
          <p className="text-xs text-muted-foreground">
            Your code never leaves the browser. Analysis happens entirely client-side in
            isolated memory sandbox zones.
          </p>
        </div>
      </main>

      <footer className="border-t border-border px-6 py-6 text-center text-xs text-muted-foreground">
        <div className="flex items-center justify-center gap-4">
          <Link to="/privacy" className="hover:text-foreground">Privacy</Link>
          <Link to="/terms" className="hover:text-foreground">Terms</Link>
          <Link to="/" className="hover:text-foreground">Home</Link>
        </div>
      </footer>
    </div>
  );
}
