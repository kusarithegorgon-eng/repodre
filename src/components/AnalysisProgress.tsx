import { Loader as Loader2, FileText, GitBranch, Network } from "lucide-react";
import type { AnalysisProgress } from "@/lib/repository-analyzer";

interface AnalysisProgressProps {
  progress: AnalysisProgress;
}

export function AnalysisProgress({ progress }: AnalysisProgressProps) {
  const getIcon = () => {
    switch (progress.phase) {
      case "connecting":
        return <GitBranch className="h-5 w-5" />;
      case "fetching":
        return <FileText className="h-5 w-5" />;
      case "parsing":
        return <Loader2 className="h-5 w-5 animate-spin" />;
      case "building":
        return <Network className="h-5 w-5" />;
      case "complete":
        return <Network className="h-5 w-5 text-teal" />;
      case "error":
        return <Network className="h-5 w-5 text-red-500" />;
    }
  };

  const getPhaseLabel = () => {
    switch (progress.phase) {
      case "connecting":
        return "Connecting to GitHub...";
      case "fetching":
        return "Fetching repository files...";
      case "parsing":
        return "Parsing source code...";
      case "building":
        return "Building dependency graph...";
      case "complete":
        return "Analysis complete!";
      case "error":
        return "Analysis failed";
    }
  };

  return (
    <div className="flex min-h-[200px] w-full flex-col items-center justify-center rounded-xl border border-border bg-surface/50 p-8">
      <div className="mb-4 flex items-center gap-3 text-muted-foreground">
        {getIcon()}
        <span className="text-sm font-medium">{getPhaseLabel()}</span>
      </div>

      <div className="mb-2 w-full max-w-sm">
        <div className="h-2 w-full overflow-hidden rounded-full bg-background">
          <div
            className="h-full rounded-full bg-teal transition-all duration-300"
            style={{ width: `${progress.percent}%` }}
          />
        </div>
      </div>

      <p className="text-sm text-muted-foreground">{progress.message}</p>

      {progress.filesProcessed !== undefined && progress.totalFiles !== undefined && (
        <p className="mt-1 text-xs text-muted-foreground/80">
          {progress.filesProcessed} / {progress.totalFiles} files
        </p>
      )}
    </div>
  );
}
