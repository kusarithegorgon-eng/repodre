import { Link } from "@tanstack/react-router";
import { FileText, CircleAlert as AlertCircle, ArrowLeft } from "lucide-react";
import { RepodreLogo } from "@/components/RepodreLogo";
import { ThemeToggle } from "@/components/ThemeToggle";

export function TermsPage() {
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
            <FileText className="h-6 w-6 text-teal" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Terms of Service</h1>
            <p className="text-sm text-muted-foreground">Last updated: July 2, 2026</p>
          </div>
        </div>

        <div className="prose prose-sm dark:prose-invert max-w-none space-y-6 text-sm leading-relaxed text-muted-foreground">
          <section>
            <h2 className="mb-2 text-lg font-semibold text-foreground">1. Acceptance of Terms</h2>
            <p>
              By accessing or using Repodre ("the Service"), you agree to be bound by these
              Terms of Service. If you do not agree, please discontinue use of the Service.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold text-foreground">2. Age Limit</h2>
            <p>
              The Service is intended for users aged <strong className="text-foreground">13 years
              and above</strong>. By using the Service, you confirm that you are at least 13
              years old. Users under 18 should obtain parental or guardian consent before
              use.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold text-foreground">3. Service Description</h2>
            <p>
              Repodre is a developer tool that generates visual architecture diagrams and
              database ERD blueprints from source code repositories. Analysis is performed
              client-side in the browser. The Service provides visual representations only
              and does not execute, modify, or interact with your actual code or databases.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold text-foreground">4. As-Is Limitation of Liability</h2>
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
              <div className="mb-2 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-amber-500" />
                <span className="text-sm font-semibold text-foreground">Important Disclaimer</span>
              </div>
              <p>
                The Service and all generated diagrams, layouts, and analysis are provided
                <strong className="text-foreground"> "AS IS" without warranty of any kind</strong>,
                express or implied. Repodre, its authors, and contributors shall <strong className="text-foreground">not
                be held liable</strong> for any damages, losses, or consequences arising from the
                interpretation or use of generated visual layouts.
              </p>
              <p className="mt-2">
                Specifically, you acknowledge that:
              </p>
              <ul className="ml-4 mt-1 list-disc space-y-1">
                <li>
                  Generated diagrams are <strong className="text-foreground">heuristic representations</strong>
                  and may not accurately reflect your actual codebase architecture.
                </li>
                <li>
                  Repodre is not responsible if you misinterpret a layout and take actions
                  such as <strong className="text-foreground">dropping a real database table</strong>,
                  modifying production code, or making architectural decisions based on
                  diagram output.
                </li>
                <li>
                  Always verify generated diagrams against your actual source code before
                  taking any action.
                </li>
              </ul>
            </div>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold text-foreground">5. Acceptable Use</h2>
            <p>You agree not to:</p>
            <ul className="ml-4 list-disc space-y-1">
              <li>Use the Service to analyze repositories you do not have permission to access</li>
              <li>Attempt to reverse-engineer, decompile, or disassemble the Service</li>
              <li>Use the Service for any illegal or unauthorized purpose</li>
              <li>Resell or redistribute generated diagrams without proper attribution</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold text-foreground">6. Intellectual Property</h2>
            <p>
              You retain all rights to your source code and repositories. Repodre does not
              claim ownership over any analyzed content. Generated diagrams are derived
              works based on your own code structure.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold text-foreground">7. AI and Automated Analysis Disclosure</h2>
            <p>
              Repodre utilizes automated background heuristics and AI-assisted analysis models
              to generate visual layouts. These systems may produce incomplete, inaccurate,
              or misleading representations. Always use professional judgment when
              interpreting results.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold text-foreground">8. Changes to Terms</h2>
            <p>
              We reserve the right to update these Terms at any time. Continued use of the
              Service after changes constitutes acceptance of the new Terms.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold text-foreground">9. Governing Law</h2>
            <p>
              These Terms are provided as-is without specific jurisdiction. The Service is
              offered on a best-effort basis.
            </p>
          </section>
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
