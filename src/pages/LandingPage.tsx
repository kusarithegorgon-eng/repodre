import { signInWithGitHub } from "@/lib/github-auth";
import { RepodreLogo } from "@/components/RepodreLogo";

export function LandingPage() {
  const bg = "#F8FAFC"; // 60%
  const fg = "#1E293B"; // 30%
  const accent = "#0D9488"; // 10%

  return (
    <div style={{ background: bg, color: fg }} className="min-h-screen">
      <nav className="sticky top-0 z-40" style={{ background: bg }}>
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-3">
            <RepodreLogo />
            <span style={{ color: fg }} className="font-semibold">Repodre</span>
          </div>
          <div className="flex items-center gap-4">
            <a href="#features" style={{ color: fg }} className="text-sm">Features</a>
            <button
              onClick={() => signInWithGitHub()}
              style={{ background: accent, color: "white" }}
              className="rounded-md px-4 py-2 text-sm font-medium shadow"
            >
              Sign in with GitHub
            </button>
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-4xl px-6 py-24 text-center">
        <section className="py-24">
          <h1 style={{ color: fg }} className="mx-auto max-w-3xl text-4xl font-bold leading-tight">
            Visualize Your Codebase Execution Architecture.
          </h1>
          <p style={{ color: fg }} className="mt-6 mx-auto max-w-2xl text-lg">
            Automate your repository documentation with zero-knowledge, local-first privacy.
          </p>
          <div className="mt-10">
            <button
              onClick={() => signInWithGitHub()}
              style={{ background: accent, color: "white" }}
              className="rounded-lg px-6 py-3 text-lg font-semibold shadow-lg"
            >
              Sign in to Start
            </button>
          </div>
        </section>

        <section id="features" className="mt-24 grid grid-cols-1 gap-8 md:grid-cols-3">
          <div style={{ background: "#1E293B", color: "#F8FAFC" }} className="rounded-lg p-8 text-center">
            <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-teal/10" />
            <h3 className="text-lg font-semibold">Repository Automation</h3>
            <p className="mt-2 text-sm">Turn GitHub URLs into visual flowcharts.</p>
          </div>
          <div style={{ background: "#1E293B", color: "#F8FAFC" }} className="rounded-lg p-8 text-center">
            <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-teal/10" />
            <h3 className="text-lg font-semibold">ERD Blueprinting</h3>
            <p className="mt-2 text-sm">Instant database relationship mapping with Crow's Foot notation.</p>
          </div>
          <div style={{ background: "#1E293B", color: "#F8FAFC" }} className="rounded-lg p-8 text-center">
            <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-teal/10" />
            <h3 className="text-lg font-semibold">Privacy-First</h3>
            <p className="mt-2 text-sm">Zero-knowledge architecture—data never leaves your browser.</p>
          </div>
        </section>

        <footer className="mt-32 border-t pt-8 text-center text-sm" style={{ color: "#1E293B" }}>
          <a href="/privacy" className="mr-4">Privacy Policy</a>
          <a href="/terms">Terms of Service</a>
        </footer>
      </main>
    </div>
  );
}
