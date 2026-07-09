/**
 * AiGuideModal — AI Interaction Protocols
 *
 * Presents four anti-hallucination protocols for interacting with AI assistants
 * about the Repodre architecture. Each protocol includes a copy-to-clipboard
 * prompt template pre-wired with the app's actual file paths, node types, and
 * RBAC resources.
 */

import { useState, useCallback } from "react";
import { X, Copy, Check, Shield, MessageSquare, GitBranch, Bug, FileCode2 } from "lucide-react";

interface AiGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface Protocol {
  id: string;
  icon: typeof Shield;
  title: string;
  subtitle: string;
  prompt: string;
  accent: string;
}

const PROTOCOLS: Protocol[] = [
  {
    id: "grounding",
    icon: Shield,
    title: "Architectural Grounding",
    subtitle: "Force the AI to cite its source within your project",
    accent: "text-teal",
    prompt: `Before explaining any part of the system, identify the specific file or node responsible for that logic. Use a Think-Act-Observe pattern:

Think: Analyze the relationship between the node and the data.
Act: Reference the specific code or schema in [File Name/Node ID].
Observe: Verify that the output logic aligns with the project schema.

Key files in this project:
- src/pages/StudioPage.tsx — main canvas orchestrator
- src/lib/db-client.ts — Supabase persistence layer (nodes, edges, annotations)
- src/lib/rbac.ts — role-based access control (admin/editor/viewer)
- src/lib/analysis/persistence.ts — batch node/edge persistence
- src/components/AnnotationPanel.tsx — annotation UI layer
- src/components/MultiplayerPresence.tsx — collaboration layer

Hallucination Check: If you cannot find a direct architectural mapping for a request, state 'Architectural Mapping Unavailable' instead of speculating.`,
  },
  {
    id: "socratic",
    icon: MessageSquare,
    title: "Socratic Verification",
    subtitle: "Test the AI's understanding of your system",
    accent: "text-blue-400",
    prompt: `Act as a Senior Architect. I want to verify your understanding of our system. Please ask me three deep-dive questions about the interaction between our Collaboration Hub and the Repository State. Your questions should force me to explain why a specific data flow exists.

Context for your questions:
- Annotations are loaded via listAnnotations(activeProjectId) in a useEffect (StudioPage.tsx ~line 455)
- The activeProjectId is resolved from URL search params or falls back to a demo workspace ID
- RBAC roles (admin/editor/viewer) gate annotation create/update/delete (src/lib/rbac.ts)
- Realtime subscriptions on nodes/edges use Supabase channels (StudioPage.tsx ~line 794)
- The refreshCanvas callback reloads the full graph from Supabase

After I answer, evaluate my understanding and point out any architectural gaps in my explanation.`,
  },
  {
    id: "visual",
    icon: GitBranch,
    title: "Visual Mapping",
    subtitle: "Force the AI to map architecture using data structures",
    accent: "text-green-400",
    prompt: `Construct a Mermaid.js sequence diagram representing the flow of a user comment through the Annotation Layer to the Database. Do not output text until the diagram accurately reflects the current node-based schema of our app.

The actual flow is:
1. User clicks a canvas node → AnnotationPanel opens (AnnotationPanel.tsx)
2. User writes a comment → handleCreateAnnotation called (StudioPage.tsx ~line 473)
3. createAnnotation(project.id, payload) → inserts into Supabase annotations table (db-client.ts)
4. RBAC check: canComment = userRole can perform "comment" action on "annotation" resource (rbac.ts)
5. Supabase RLS policy validates auth.uid() = user_id
6. Realtime subscription fires → refreshCanvas reloads graph (StudioPage.tsx ~line 794)
7. Annotation list re-fetches via listAnnotations(activeProjectId)

Map this as a sequence diagram with the actual participant names.`,
  },
  {
    id: "constraint",
    icon: Bug,
    title: "Constraint-Based Debugging",
    subtitle: "Force the AI to consider the 'why' behind a fix",
    accent: "text-orange-400",
    prompt: `When you propose a code change, you must include a 'Constraint Analysis' section. List:

1. The specific system node this change impacts.
   (Nodes are typed: View/Endpoint, Validation, Controller, Database, Gateway, Misc)

2. The potential ripple effect on the RBAC (Role-Based Access Control) permissions.
   (Resources: project, node, edge, annotation, presence, comment
    Roles: admin, editor, viewer
    Actions: view, create, update, delete, comment, manage)

3. Why this solution is the most architecturally sound approach compared to [Alternative Approach].

Additional constraints to consider:
- All persistence goes through src/lib/db-client.ts (Supabase client)
- RLS policies enforce auth.uid() = user_id on every table
- The activeProjectId variable must be declared before any useEffect that references it (TDZ guard)
- Realtime subscriptions must clean up on unmount to prevent duplicate listeners
- Annotation and collaboration layers must guard against null/undefined project state`,
  },
];

export function AiGuideModal({ isOpen, onClose }: AiGuideModalProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = useCallback(async (protocol: Protocol) => {
    try {
      await navigator.clipboard.writeText(protocol.prompt);
      setCopiedId(protocol.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Clipboard API may be unavailable in some contexts
    }
  }, []);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-surface shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-surface px-6 py-4">
          <div className="flex items-center gap-2.5">
            <FileCode2 className="h-5 w-5 text-teal" />
            <div>
              <h2 className="text-lg font-semibold text-foreground">AI Interaction Protocols</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Anti-hallucination patterns for grounded AI collaboration</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-6 space-y-4">
          {/* Intro */}
          <div className="rounded-lg bg-teal/5 border border-teal/20 p-4">
            <p className="text-sm text-muted-foreground leading-relaxed">
              These four protocols ensure AI assistants stay grounded in your actual architecture
              instead of speculating. Each template is pre-wired with your project's file paths,
              node types, and RBAC resources. Click <span className="font-medium text-foreground">Copy</span> to
              use a prompt in any AI chat.
            </p>
          </div>

          {/* Protocol cards */}
          {PROTOCOLS.map((protocol, index) => {
            const Icon = protocol.icon;
            const isCopied = copiedId === protocol.id;

            return (
              <div
                key={protocol.id}
                className="rounded-xl border border-border bg-background/50 overflow-hidden transition-all hover:border-teal/30"
              >
                {/* Card header */}
                <div className="flex items-start gap-3 p-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-teal/10">
                    <Icon className={`h-5 w-5 ${protocol.accent}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-mono text-[10px] text-muted-foreground">
                        Protocol {index + 1}
                      </span>
                    </div>
                    <h3 className="text-sm font-semibold text-foreground">{protocol.title}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">{protocol.subtitle}</p>
                  </div>
                  <button
                    onClick={() => handleCopy(protocol)}
                    className={`flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-all ${
                      isCopied
                        ? "border-teal/50 bg-teal/10 text-teal"
                        : "border-border bg-background text-muted-foreground hover:border-teal/40 hover:text-teal"
                    }`}
                  >
                    {isCopied ? (
                      <>
                        <Check className="h-3.5 w-3.5" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        Copy
                      </>
                    )}
                  </button>
                </div>

                {/* Prompt preview */}
                <div className="border-t border-border/60 bg-surface/50 px-4 py-3">
                  <pre className="whitespace-pre-wrap text-[11px] leading-relaxed text-muted-foreground font-mono max-h-32 overflow-y-auto scrollbar-thin">
                    {protocol.prompt}
                  </pre>
                </div>
              </div>
            );
          })}

          {/* Footer note */}
          <div className="rounded-lg border border-border bg-background/30 p-3">
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              <span className="font-medium text-foreground">Tip:</span> The Architectural Grounding
              protocol is the most effective first step. If the AI cannot map its response to a
              specific file in this project, it will state "Architectural Mapping Unavailable"
              rather than guessing.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-border px-6 py-4">
          <button
            onClick={onClose}
            className="w-full rounded-lg bg-teal px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-teal/90"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// Toggle button for header/sidebar
export function AiGuideToggle({
  onClick,
  isOpen,
}: {
  onClick: () => void;
  isOpen: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title="AI Interaction Protocols"
      className={`flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-medium transition-all ${
        isOpen
          ? "border-teal/50 bg-teal/10 text-teal"
          : "border-border bg-background text-muted-foreground hover:border-teal hover:text-teal"
      }`}
    >
      <Shield className="h-3.5 w-3.5" />
      AI Guide
    </button>
  );
}
