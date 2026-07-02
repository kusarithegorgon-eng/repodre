import { useState } from "react";
import { Sparkles, X } from "lucide-react";

export function AiDisclosureBadge() {
  const [showInfo, setShowInfo] = useState(false);

  return (
    <>
      <button
        onClick={() => setShowInfo(true)}
        className="flex items-center gap-1.5 rounded-full border border-border bg-surface/80 px-2.5 py-1 text-[10px] font-medium text-muted-foreground transition-all hover:border-teal/40 hover:text-teal"
        title="AI-assisted analysis disclosure"
      >
        <Sparkles className="h-3 w-3" />
        AI-Assisted
      </button>

      {showInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowInfo(false)}>
          <div
            className="mx-4 max-w-md rounded-xl border border-border bg-popover p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal/10">
                  <Sparkles className="h-4 w-4 text-teal" />
                </div>
                <h3 className="text-sm font-semibold text-foreground">AI-Assisted Analysis</h3>
              </div>
              <button
                onClick={() => setShowInfo(false)}
                className="flex h-6 w-6 items-center justify-center rounded-md hover:bg-accent"
              >
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Repodre's layout generation utilizes automated background heuristics and
              AI-assisted analysis models to produce visual architecture diagrams. These
              representations are approximate and may not fully reflect your actual codebase.
              Always verify against your source code before making architectural decisions.
            </p>
            <p className="mt-3 text-[10px] text-muted-foreground/70">
              See our Terms of Service for full limitation of liability details.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
