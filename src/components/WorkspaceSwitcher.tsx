/**
 * WorkspaceSwitcher — viewport toggle
 *
 * A segmented control in the header that switches between the two workspace
 * viewports:
 *   - App Journey  (horizontal left-to-right execution timeline)
 *   - Database ERD (multi-directional relational grid)
 */

import { Workflow, Database } from "lucide-react";
import type { Workspace } from "@/lib/db-client";

interface WorkspaceSwitcherProps {
  workspace: Workspace;
  onChange: (workspace: Workspace) => void;
}

export function WorkspaceSwitcher({ workspace, onChange }: WorkspaceSwitcherProps) {
  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-border bg-background p-1">
      <button
        onClick={() => onChange("app")}
        title="App Journey viewport — horizontal execution timeline"
        className={`flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-all ${
          workspace === "app"
            ? "bg-teal/20 text-teal shadow-[0_0_14px_-4px_var(--teal)]"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <Workflow className="h-3.5 w-3.5" />
        App Journey
      </button>
      <button
        onClick={() => onChange("erd")}
        title="Database ERD viewport — relational grid with Crow's Foot notation"
        className={`flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-all ${
          workspace === "erd"
            ? "bg-teal/20 text-teal shadow-[0_0_14px_-4px_var(--teal)]"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <Database className="h-3.5 w-3.5" />
        Database ERD
      </button>
    </div>
  );
}
