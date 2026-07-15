import { Link } from "@tanstack/react-router";
import { Shield, Lock, ArrowLeft, Database, Globe, UserCheck, Trash2, Download, Mail } from "lucide-react";
import { RepodreLogo } from "@/components/RepodreLogo";
import { ThemeToggle } from "@/components/ThemeToggle";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

function InfoBox({ icon: Icon, children }: { icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 rounded-lg border border-teal/20 bg-teal/5 p-4">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-teal" />
      <p className="text-xs leading-relaxed text-muted-foreground">{children}</p>
    </div>
  );
}

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
        {/* Header */}
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-teal/10">
            <Shield className="h-6 w-6 text-teal" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Privacy Policy</h1>
            <p className="text-sm text-muted-foreground">Last updated: July 5, 2026 · Effective: July 5, 2026</p>
          </div>
        </div>

        <div className="space-y-8">

          {/* Data Controller */}
          <Section title="1. Data Controller">
            <p>
              Repodre ("we", "us", or "our") is the data controller responsible for personal data
              processed through this Service. For all data-related enquiries, including requests to
              exercise your rights under applicable privacy law, contact us at:
            </p>
            <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-3">
              <Mail className="h-4 w-4 shrink-0 text-teal" />
              <a href="mailto:privacy@repodre.dev" className="text-sm font-medium text-teal hover:underline">
                privacy@repodre.dev
              </a>
            </div>
            <p>
              We aim to respond to all data-subject requests within <strong className="text-foreground">30 days</strong>{" "}
              of receipt. In complex cases we may extend this by a further 60 days, in which case we
              will notify you within the initial 30-day window.
            </p>
          </Section>

          {/* Zero-Knowledge Architecture */}
          <Section title="2. Zero-Knowledge Architecture">
            <p>
              Repository parsing and source-code analysis runs <strong className="text-foreground">entirely
              inside your browser's memory</strong>. Your source code, file contents, and parsed
              AST structures are never transmitted to, stored on, or processed by any external server.
              The analysis engine is shipped as a static JavaScript bundle and executes locally.
            </p>
            <InfoBox icon={Lock}>
              Your code never leaves the browser. Only the visual diagram metadata you explicitly
              choose to save is persisted to our database.
            </InfoBox>
          </Section>

          {/* What We Collect */}
          <Section title="3. Personal Data We Collect and Lawful Basis">
            <p>
              We process personal data only where we have a lawful basis under{" "}
              <strong className="text-foreground">GDPR Article 6</strong>. The table below
              describes each category of data, why we collect it, and the legal basis:
            </p>
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full text-xs">
                <thead className="bg-surface">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-foreground">Data Category</th>
                    <th className="px-3 py-2 text-left font-medium text-foreground">Purpose</th>
                    <th className="px-3 py-2 text-left font-medium text-foreground">Lawful Basis</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  <tr>
                    <td className="px-3 py-2">GitHub user ID, username, avatar URL, email</td>
                    <td className="px-3 py-2">Account authentication and personalisation</td>
                    <td className="px-3 py-2">Art. 6(1)(b) — contract performance</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2">GitHub OAuth access token</td>
                    <td className="px-3 py-2">Fetch repository files for client-side analysis</td>
                    <td className="px-3 py-2">Art. 6(1)(b) — contract performance</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2">Saved project diagrams (node labels, positions, edges)</td>
                    <td className="px-3 py-2">Persist your visual workspace across sessions</td>
                    <td className="px-3 py-2">Art. 6(1)(b) — contract performance</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2">Project names and descriptions you provide</td>
                    <td className="px-3 py-2">Identify and organise your saved projects</td>
                    <td className="px-3 py-2">Art. 6(1)(b) — contract performance</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2">Session identifiers (stored in browser localStorage)</td>
                    <td className="px-3 py-2">Maintain authenticated sessions without repeated logins</td>
                    <td className="px-3 py-2">Art. 6(1)(f) — legitimate interests</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p>
              We do <strong className="text-foreground">not</strong> collect: source code contents,
              parsed AST structures, repository URLs beyond the current session (unless saved),
              IP addresses for tracking purposes, behavioural analytics, or advertising data.
            </p>
          </Section>

          {/* Local Storage */}
          <Section title="4. Browser Storage (localStorage / sessionStorage)">
            <p>
              We use your browser's <strong className="text-foreground">localStorage</strong> to
              persist your canvas state between browser sessions and{" "}
              <strong className="text-foreground">sessionStorage</strong> for temporary draft
              analysis results (cleared when the browser tab is closed). We do{" "}
              <strong className="text-foreground">not</strong> use HTTP cookies for tracking or
              advertising. The session authentication token issued by Supabase Auth may be stored
              in localStorage per the Supabase SDK default; this token is used solely to maintain
              your authenticated session and expires automatically.
            </p>
          </Section>

          {/* Sub-Processors */}
          <Section title="5. Third-Party Sub-Processors">
            <p>
              We engage the following third-party sub-processors to deliver the Service. Each
              sub-processor is bound by a Data Processing Agreement with Repodre and must
              process data only according to our instructions:
            </p>
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full text-xs">
                <thead className="bg-surface">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-foreground">Sub-Processor</th>
                    <th className="px-3 py-2 text-left font-medium text-foreground">Purpose</th>
                    <th className="px-3 py-2 text-left font-medium text-foreground">Data Location</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  <tr>
                    <td className="px-3 py-2 font-medium text-foreground">Supabase, Inc.</td>
                    <td className="px-3 py-2">Database storage, authentication, real-time features</td>
                    <td className="px-3 py-2">USA (AWS us-east-1)</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 font-medium text-foreground">GitHub, Inc. (Microsoft)</td>
                    <td className="px-3 py-2">OAuth authentication; repository file access (user-initiated only)</td>
                    <td className="px-3 py-2">USA</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p>
              Data transfers to the USA are covered by the applicable{" "}
              <strong className="text-foreground">EU Standard Contractual Clauses (SCCs)</strong> or{" "}
              the EU-US Data Privacy Framework as adopted by each sub-processor.
            </p>
          </Section>

          {/* Data Retention */}
          <Section title="6. Data Retention">
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full text-xs">
                <thead className="bg-surface">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-foreground">Data</th>
                    <th className="px-3 py-2 text-left font-medium text-foreground">Retention Period</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  <tr>
                    <td className="px-3 py-2">Saved project diagrams</td>
                    <td className="px-3 py-2">Until you delete the project or your account</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2">GitHub OAuth token</td>
                    <td className="px-3 py-2">Until you sign out or revoke access via GitHub Settings</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2">Account / profile data</td>
                    <td className="px-3 py-2">Until account deletion is requested</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2">Unsaved analysis data (sessionStorage)</td>
                    <td className="px-3 py-2">Cleared when the browser tab is closed</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2">Canvas auto-save (localStorage)</td>
                    <td className="px-3 py-2">Until cleared by you or via browser settings</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Section>

          {/* Your Rights */}
          <Section title="7. Your Rights Under GDPR (EEA / UK Residents)">
            <p>
              If you are located in the European Economic Area or the United Kingdom, you have the
              following rights regarding your personal data:
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { icon: UserCheck, title: "Right of Access (Art. 15)", desc: "Request a copy of all personal data we hold about you." },
                { icon: UserCheck, title: "Right to Rectification (Art. 16)", desc: "Ask us to correct inaccurate or incomplete personal data." },
                { icon: Trash2, title: "Right to Erasure (Art. 17)", desc: "Request deletion of your personal data where it is no longer needed." },
                { icon: Download, title: "Right to Portability (Art. 20)", desc: "Receive your data in a structured, machine-readable format." },
                { icon: Shield, title: "Right to Restrict Processing (Art. 18)", desc: "Ask us to pause processing of your data in certain circumstances." },
                { icon: Globe, title: "Right to Object (Art. 21)", desc: "Object to processing based on legitimate interests." },
              ].map(({ icon: Icon, title, desc }) => (
                <div key={title} className="flex gap-3 rounded-lg border border-border p-3">
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-teal" />
                  <div>
                    <p className="text-xs font-medium text-foreground">{title}</p>
                    <p className="text-xs text-muted-foreground">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <p>
              To exercise any of these rights, email{" "}
              <a href="mailto:privacy@repodre.dev" className="text-teal hover:underline">privacy@repodre.dev</a>.
              You also have the right to lodge a complaint with your local data protection
              supervisory authority (e.g., the ICO in the UK, or the relevant DPA in your EU member state).
            </p>
          </Section>

          {/* CCPA */}
          <Section title="8. California Privacy Rights (CCPA / CPRA)">
            <p>
              If you are a California resident, the California Consumer Privacy Act (CCPA) and
              California Privacy Rights Act (CPRA) grant you the following rights:
            </p>
            <ul className="ml-4 list-disc space-y-1">
              <li><strong className="text-foreground">Right to Know</strong> — what personal information we collect, use, and disclose.</li>
              <li><strong className="text-foreground">Right to Delete</strong> — request deletion of your personal information.</li>
              <li><strong className="text-foreground">Right to Correct</strong> — request correction of inaccurate personal information.</li>
              <li><strong className="text-foreground">Right to Opt-Out</strong> — we do not sell personal information. We do not share personal information for cross-context behavioural advertising.</li>
              <li><strong className="text-foreground">Right to Non-Discrimination</strong> — we will not discriminate against you for exercising any CCPA right.</li>
            </ul>
            <p>
              To submit a California privacy request, email{" "}
              <a href="mailto:privacy@repodre.dev" className="text-teal hover:underline">privacy@repodre.dev</a>{" "}
              with the subject line "CCPA Request". We will respond within{" "}
              <strong className="text-foreground">45 days</strong>.
            </p>
          </Section>

          {/* Security */}
          <Section title="9. Data Security">
            <p>
              We implement appropriate technical and organisational measures to protect your personal
              data against accidental or unlawful destruction, loss, alteration, or unauthorised
              disclosure. These include:
            </p>
            <ul className="ml-4 list-disc space-y-1">
              <li>Row-level security (RLS) policies on all database tables ensuring users can only access their own data</li>
              <li>TLS encryption in transit for all API requests</li>
              <li>Supabase's AES-256 encryption at rest</li>
              <li>OAuth 2.0 for authentication (no passwords stored)</li>
            </ul>
            <p>
              No method of internet transmission or electronic storage is 100% secure. In the event
              of a personal data breach that poses a high risk to your rights and freedoms, we will
              notify affected individuals within <strong className="text-foreground">72 hours</strong>{" "}
              of becoming aware of the breach, in compliance with GDPR Article 34.
            </p>
          </Section>

          {/* Children */}
          <Section title="10. Children's Privacy">
            <p>
              The Service is not directed to children under the age of 13. We do not knowingly
              collect personal data from children under 13. If we become aware that a child under
              13 has provided personal data, we will take steps to delete it promptly. If you
              believe a child has provided data to us, contact us at{" "}
              <a href="mailto:privacy@repodre.dev" className="text-teal hover:underline">privacy@repodre.dev</a>.
            </p>
          </Section>

          {/* Changes */}
          <Section title="11. Changes to This Policy">
            <p>
              We may update this Privacy Policy from time to time. Material changes will be
              indicated by updating the "Last updated" date at the top of this page. We encourage
              you to review this page periodically. Continued use of the Service after changes
              constitutes acceptance of the revised Policy.
            </p>
          </Section>

          {/* Contact */}
          <Section title="12. Contact Us">
            <p>
              For privacy questions, data access requests, or complaints:
            </p>
            <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-3">
              <Mail className="h-4 w-4 shrink-0 text-teal" />
              <a href="mailto:privacy@repodre.dev" className="text-sm font-medium text-teal hover:underline">
                privacy@repodre.dev
              </a>
            </div>
          </Section>

        </div>

        <div className="mt-12 flex items-center gap-2 rounded-lg border border-teal/20 bg-teal/5 p-4">
          <Lock className="h-5 w-5 shrink-0 text-teal" />
          <p className="text-xs text-muted-foreground">
            Your code never leaves the browser. Repository analysis happens entirely client-side
            in isolated browser memory — no source code is ever transmitted to our servers.
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
