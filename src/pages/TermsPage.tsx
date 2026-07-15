import { Link } from "@tanstack/react-router";
import { FileText, CircleAlert as AlertCircle, ArrowLeft, ShieldCheck, Ban, Scale, UserCheck, Bell, Gavel, Clock } from "lucide-react";
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
            <p className="text-sm text-muted-foreground">Last updated: July 5, 2026</p>
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

          {/* ── IP Infringement Warranty ── */}
          <section>
            <div className="mb-3 flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-teal" />
              <h2 className="text-lg font-semibold text-foreground">4. Intellectual Property Infringement Warranty</h2>
            </div>
            <div className="rounded-lg border border-teal/20 bg-teal/5 p-4">
              <p className="mb-3">
                <strong className="text-foreground">User Declaration.</strong> By uploading,
                pasting, or otherwise submitting any software repository, file code text, or
                database structure into the Repodre workspace, you explicitly affirm and
                warrant that:
              </p>
              <ul className="ml-4 list-disc space-y-1">
                <li>
                  You own all right, title, and interest in the submitted materials, <strong className="text-foreground">or</strong>
                </li>
                <li>
                  You hold a valid, current, and globally applicable copyright license or
                  authorization from the rightful owner permitting you to submit, display,
                  and process the materials through the Service.
                </li>
              </ul>
              <p className="mt-3">
                <strong className="text-foreground">Assumption of Liability.</strong> You
                assume <strong className="text-foreground">all legal defense and financial
                liabilities</strong> arising from your submission of proprietary code that
                infringes on a third party's intellectual property rights or compromises
                corporate trade secrets. You agree to indemnify, defend, and hold harmless
                Repodre, its authors, contributors, and affiliates from any claims, damages,
                attorneys' fees, or liabilities resulting from your submission of
                infringing materials.
              </p>
              <p className="mt-2">
                Repodre does not screen, review, or validate the ownership or licensing
                status of submitted materials. The sole responsibility for ensuring
                non-infringement rests with you, the user.
              </p>
            </div>
          </section>

          {/* ── Total Limitation of Liability ── */}
          <section>
            <div className="mb-3 flex items-center gap-2">
              <Scale className="h-5 w-5 text-amber-500" />
              <h2 className="text-lg font-semibold text-foreground">5. Total Limitation of Liability &amp; Warranty Disclaimer</h2>
            </div>
            <div className="rounded-lg border-2 border-amber-500/30 bg-amber-500/5 p-5">
              <div className="mb-3 flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-amber-500" />
                <span className="text-sm font-semibold text-foreground">AS-IS Disclaimer</span>
              </div>
              <p className="uppercase tracking-wide font-bold text-foreground leading-relaxed">
                THE SERVICE AND ALL GENERATED DIAGRAMS, LAYOUTS, SECURITY ALERTS, EXECUTION
                ROUTE ARROWS, AND ANALYSIS ARE PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT
                WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO
                IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE,
                NON-INFRINGEMENT, AND TITLE.
              </p>
              <p className="mt-3 uppercase tracking-wide font-bold text-foreground leading-relaxed">
                THE AUTOMATED VISUAL LAYOUT MAPPING TOOLS, SECURITY ALERTS, AND EXECUTION
                ROUTE ARROWS FUNCTION AS INTERPRETIVE HEURISTICS ONLY AND DO NOT REPRESENT
                GUARANTEED OR EXACT REFLECTIONS OF YOUR CODEBASE ARCHITECTURE.
              </p>
              <p className="mt-3 uppercase tracking-wide font-bold text-foreground leading-relaxed">
                THE COMPANY DISCLAIMS ALL EXPRESS AND IMPLIED WARRANTIES. UNDER NO
                CIRCUMSTANCES SHALL THE COMPANY, ITS AUTHORS, CONTRIBUTORS, OR AFFILIATES
                BE HELD FINANCIALLY OR LEGALLY LIABLE FOR SYSTEM OUTAGES, DATA CORRUPTION,
                CODE INTERPRETATION ERRORS, OR DOWNSTREAM BUSINESS LOSSES CAUSED BY USER
                RELIANCE ON THE CANVAS FLOWCHARTS OR ANY OUTPUT OF THE SERVICE.
              </p>
              <p className="mt-3 text-xs normal-case font-normal text-muted-foreground">
                Some jurisdictions do not allow the exclusion of certain warranties or
                limitations of liability. In such cases, the above limitations apply to the
                fullest extent permitted by applicable law.
              </p>
            </div>
          </section>

          {/* ── Acceptable Use Boundaries ── */}
          <section>
            <div className="mb-3 flex items-center gap-2">
              <Ban className="h-5 w-5 text-red-500" />
              <h2 className="text-lg font-semibold text-foreground">6. Acceptable Use Boundaries</h2>
            </div>
            <p>You agree not to:</p>
            <ul className="ml-4 list-disc space-y-1">
              <li>Use the Service to analyze repositories you do not have permission to access</li>
              <li>Attempt to reverse-engineer, decompile, or disassemble the Service</li>
              <li>Use the Service for any illegal or unauthorized purpose</li>
              <li>Resell or redistribute generated diagrams without proper attribution</li>
            </ul>
            <div className="mt-3 rounded-lg border border-red-500/20 bg-red-500/5 p-4">
              <p className="mb-2">
                <strong className="text-foreground">Prohibition on Automated Extraction.</strong>
                You are expressly prohibited from utilizing automated scripters, scrapers,
                crawlers, bots, or reverse-engineering scripts to:
              </p>
              <ul className="ml-4 list-disc space-y-1">
                <li>
                  Copy, extract, or exfiltrate internal canvas layout coordinates, node
                  positioning data, or routing logic engines from the Service.
                </li>
                <li>
                  Attack, overload, or stress-test the Service's internal routing algorithms,
                  edge computation engines, or layout heuristics.
                </li>
                <li>
                  Systematically reproduce, clone, or derive the Service's proprietary
                  layout intelligence through automated means.
                </li>
              </ul>
              <p className="mt-2">
                Violation of this clause may result in immediate termination of access
                and reserves the company's right to pursue legal remedies.
              </p>
            </div>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold text-foreground">7. Intellectual Property</h2>
            <p>
              You retain all rights to your source code and repositories. Repodre does not
              claim ownership over any analyzed content. Generated diagrams are derived
              works based on your own code structure.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-lg font-semibold text-foreground">8. AI and Automated Analysis Disclosure</h2>
            <p>
              Repodre utilizes automated background heuristics and AI-assisted analysis models
              to generate visual layouts. These systems may produce incomplete, inaccurate,
              or misleading representations. Always use professional judgment when
              interpreting results.
            </p>
          </section>

          {/* ── User Rights ── */}
          <section>
            <div className="mb-3 flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-teal" />
              <h2 className="text-lg font-semibold text-foreground">9. User Rights &amp; Account Control</h2>
            </div>
            <div className="rounded-lg border border-teal/20 bg-teal/5 p-4">
              <p className="mb-3">
                You retain control over your account and submitted data. You may at any time:
              </p>
              <ul className="ml-4 list-disc space-y-1">
                <li>
                  <strong className="text-foreground">Request Data Export.</strong> Export all your
                  submitted repository analysis data and saved diagrams in a portable format.
                </li>
                <li>
                  <strong className="text-foreground">Request Account Deletion.</strong> Permanently
                  delete your account and all associated data by contacting{" "}
                  <a href="mailto:support@repodre.dev" className="text-teal hover:underline">
                    support@repodre.dev
                  </a>{" "}
                  or through in-app account settings.
                </li>
                <li>
                  <strong className="text-foreground">Revoke GitHub Access.</strong> Disconnect your
                  GitHub OAuth connection at any time via your GitHub account settings under
                  Authorized OAuth Apps.
                </li>
              </ul>
              <p className="mt-3">
                Account deletion requests are processed within <strong className="text-foreground">30 days</strong>.
                Upon deletion, all personal data, saved projects, and analysis history are permanently
                removed from our systems and from Supabase-hosted databases.
              </p>
            </div>
          </section>

          {/* ── Data Retention ── */}
          <section>
            <div className="mb-3 flex items-center gap-2">
              <Clock className="h-5 w-5 text-teal" />
              <h2 className="text-lg font-semibold text-foreground">10. Data Retention</h2>
            </div>
            <p>
              We retain your data only as long as necessary for the purposes outlined in our
              Privacy Policy. Key retention periods:
            </p>
            <ul className="ml-4 list-disc space-y-1">
              <li>Account data: Retained until account deletion</li>
              <li>Analysis results: Retained until project deletion or account deletion</li>
              <li>OAuth tokens: Revoked upon account deletion or manual disconnection</li>
            </ul>
            <p className="mt-2">
              For full details, see our{" "}
              <Link to="/privacy" className="text-teal hover:underline">
                Privacy Policy
              </Link>.
            </p>
          </section>

          {/* ── Changes to Terms ── */}
          <section>
            <div className="mb-3 flex items-center gap-2">
              <Bell className="h-5 w-5 text-amber-500" />
              <h2 className="text-lg font-semibold text-foreground">11. Changes to Terms</h2>
            </div>
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
              <p className="mb-2">
                We reserve the right to update these Terms at any time. When material changes are made:
              </p>
              <ul className="ml-4 list-disc space-y-1">
                <li>
                  We will provide <strong className="text-foreground">at least 30 days&apos; notice</strong> via
                  email (if you have provided one) and an in-app banner before changes take effect.
                </li>
                <li>
                  Continued use of the Service after the effective date constitutes acceptance of the
                  updated Terms.
                </li>
                <li>
                  You may request account deletion before the effective date if you do not agree with
                  the changes.
                </li>
              </ul>
              <p className="mt-2 text-xs text-muted-foreground">
                Non-material changes (typo fixes, formatting) may be made without notice.
              </p>
            </div>
          </section>

          {/* ── Governing Law ── */}
          <section>
            <div className="mb-3 flex items-center gap-2">
              <Gavel className="h-5 w-5 text-teal" />
              <h2 className="text-lg font-semibold text-foreground">12. Governing Law &amp; Dispute Resolution</h2>
            </div>
            <p>
              These Terms shall be governed by and construed in accordance with the laws of the
              United States and the State of Delaware, without regard to its conflict of law provisions.
            </p>
            <p className="mt-2">
              <strong className="text-foreground">Informal Resolution.</strong> In the event of any dispute
              arising out of or relating to these Terms, the parties agree to first attempt to resolve
              the dispute through good-faith negotiation for a period of at least 30 days.
            </p>
            <p className="mt-2">
              <strong className="text-foreground">Binding Arbitration.</strong> If informal resolution fails,
              any controversy or claim shall be resolved by binding arbitration in accordance with the
              rules of the American Arbitration Association. The arbitration shall take place in
              Wilmington, Delaware.
            </p>
            <p className="mt-3 text-xs text-muted-foreground">
              The Service is operated by Repodre. For contact information, see our Privacy Policy.
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
