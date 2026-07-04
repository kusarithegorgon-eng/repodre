/**
 * GuideModal — Instruction-Driven UI Guide
 *
 * A modal that explains the Repodre analysis process:
 * Auth -> Parse -> Sync -> Visualize
 */

import { X, Lock, FileSearch, RefreshCw, Eye, CircleCheck as CheckCircle2, ArrowRight } from "lucide-react";

interface GuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const STEPS = [
  {
    id: "auth",
    icon: Lock,
    title: "Authenticate",
    description: "Sign in with GitHub to grant read access to your repositories. Your token never leaves your browser.",
    details: [
      " OAuth flow via Supabase",
      "Read-only repository scope",
      "Secure token handling",
    ],
  },
  {
    id: "parse",
    icon: FileSearch,
    title: "Parse",
    description: "Repodre scans your repository structure, parsing source files to detect routes, controllers, validations, and database tables.",
    details: [
      "Next.js App/Pages Router detection",
      "API route controller mapping",
      "Form validation schema extraction",
      "Database table identification",
    ],
  },
  {
    id: "sync",
    icon: RefreshCw,
    title: "Sync",
    description: "The parsed architecture is synchronized to your workspace, creating nodes and edges that represent your application's flow.",
    details: [
      "Auto-layout positioning",
      "Smart edge routing",
      "Real-time persistence",
    ],
  },
  {
    id: "visualize",
    icon: Eye,
    title: "Visualize",
    description: "Interact with your execution flow map: click nodes to inspect code, edit labels, add connections, and export scaffolds.",
    details: [
      "Node classification badges",
      "Raw source view toggle",
      "Decision explanations",
      "Export to code templates",
    ],
  },
];

const NODE_TYPES = [
  { type: "View/Endpoint", shape: "pill", color: "bg-green-500", description: "User-facing routes (pages)" },
  { type: "Validation", shape: "diamond", color: "bg-purple-500", description: "Form/schema validation checks" },
  { type: "Controller", shape: "rectangle", color: "bg-teal-500", description: "API route handlers" },
  { type: "Database", shape: "cylinder", color: "bg-blue-500", description: "Tables and schemas" },
  { type: "Gateway", shape: "hexagon", color: "bg-orange-500", description: "Auth/role routing switches" },
  { type: "Misc", shape: "document", color: "bg-gray-500", description: "Unclassified files (not skipped)" },
];

export function GuideModal({ isOpen, onClose }: GuideModalProps) {
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
          <h2 className="text-lg font-semibold text-foreground">
            How Repodre Works
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-6 space-y-8">
          {/* Process flow */}
          <div>
            <h3 className="mb-4 text-sm font-medium text-muted-foreground uppercase tracking-wider">
              Analysis Pipeline
            </h3>
            <div className="space-y-4">
              {STEPS.map((step, index) => (
                <div key={step.id} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal/10 text-teal">
                      <step.icon className="h-5 w-5" />
                    </div>
                    {index < STEPS.length - 1 && (
                      <div className="h-full w-px bg-border mt-2" />
                    )}
                  </div>
                  <div className="flex-1 pb-6">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-xs text-muted-foreground">
                        Step {index + 1}
                      </span>
                      {index < STEPS.length - 1 && (
                        <ArrowRight className="h-3 w-3 text-muted-foreground" />
                      )}
                    </div>
                    <h4 className="font-medium text-foreground mb-1">
                      {step.title}
                    </h4>
                    <p className="text-sm text-muted-foreground mb-2">
                      {step.description}
                    </p>
                    <ul className="space-y-1">
                      {step.details.map((detail, i) => (
                        <li
                          key={i}
                          className="flex items-center gap-2 text-xs text-muted-foreground"
                        >
                          <CheckCircle2 className="h-3 w-3 text-teal shrink-0" />
                          {detail}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Node classification */}
          <div>
            <h3 className="mb-4 text-sm font-medium text-muted-foreground uppercase tracking-wider">
              Node Classification
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              Every file is classified into a node type. Files that don't match specific patterns are labeled as <span className="font-medium text-foreground">Misc</span> so nothing is lost.
            </p>
            <div className="grid gap-3">
              {NODE_TYPES.map((node) => (
                <div
                  key={node.type}
                  className="flex items-center gap-3 rounded-lg border border-border bg-background/50 px-4 py-3"
                >
                  <div className={`h-4 w-4 rounded ${node.color}`} />
                  <span className="font-mono text-sm text-foreground">
                    {node.type}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    ({node.shape})
                  </span>
                  <span className="ml-auto text-sm text-muted-foreground">
                    {node.description}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Tips */}
          <div className="rounded-lg bg-teal/5 border border-teal/20 p-4">
            <h3 className="mb-2 text-sm font-medium text-teal">Pro Tips</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="text-teal">1.</span>
                Click any node to see why it was classified that way in the sidebar.
              </li>
              <li className="flex items-start gap-2">
                <span className="text-teal">2.</span>
                Toggle "View Raw" in the code panel to see the original GitHub source.
              </li>
              <li className="flex items-start gap-2">
                <span className="text-teal">3.</span>
                Misc nodes are shown with a document shape so you know nothing was skipped.
              </li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-border px-6 py-4">
          <button
            onClick={onClose}
            className="w-full rounded-lg bg-teal px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-teal/90"
          >
            Got it, let's map some repos
          </button>
        </div>
      </div>
    </div>
  );
}

// Toggle button component for header
export function GuideToggle({
  onClick,
  isOpen,
}: {
  onClick: () => void;
  isOpen: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title="How Repodre works"
      className={`flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-medium transition-all ${
        isOpen
          ? "border-teal/50 bg-teal/10 text-teal"
          : "border-border bg-background text-muted-foreground hover:border-teal hover:text-teal"
      }`}
    >
      <FileSearch className="h-3.5 w-3.5" />
      Guide
    </button>
  );
}
