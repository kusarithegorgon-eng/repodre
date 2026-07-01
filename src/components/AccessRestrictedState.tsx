import { Lock, GitBranch, CircleAlert as AlertCircle } from "lucide-react";
import type { AccessCheckResult } from "@/lib/github-api";

interface AccessRestrictedStateProps {
  accessCheck: AccessCheckResult;
  onRetry?: () => void;
  onSignIn?: () => void;
}

export function AccessRestrictedState({
  accessCheck,
  onRetry,
  onSignIn,
}: AccessRestrictedStateProps) {
  const getIcon = () => {
    switch (accessCheck.reason) {
      case "private":
      case "forbidden":
        return <Lock className="h-12 w-12 text-neon-purple" />;
      case "not_found":
        return <GitBranch className="h-12 w-12 text-muted-foreground" />;
      default:
        return <AlertCircle className="h-12 w-12 text-yellow-500" />;
    }
  };

  const getTitle = () => {
    switch (accessCheck.reason) {
      case "private":
      case "forbidden":
        return "Private Repository";
      case "not_found":
        return "Repository Not Found";
      case "no_token":
        return "Sign In Required";
      default:
        return "Access Issue";
    }
  };

  const getDescription = () => {
    switch (accessCheck.reason) {
      case "private":
        return "This repository is private. Sign in with GitHub and grant repo access to analyze private repositories.";
      case "forbidden":
        return "You don't have permission to access this repository. Ensure your GitHub token has the 'repo' scope for private repositories.";
      case "not_found":
        return "The repository could not be found. Check that the URL is correct and you have access to it.";
      case "no_token":
        return "Sign in with GitHub to analyze repositories. Your data stays private and you can revoke access at any time.";
      default:
        return accessCheck.message;
    }
  };

  return (
    <div className="flex min-h-[300px] w-full flex-col items-center justify-center rounded-xl border border-border bg-surface/50 p-8 text-center">
      <div className="mb-4 rounded-full bg-background p-4 shadow-lg">
        {getIcon()}
      </div>

      <h3 className="mb-2 text-lg font-semibold text-foreground">
        {getTitle()}
      </h3>

      <p className="mb-6 max-w-sm text-sm text-muted-foreground">
        {getDescription()}
      </p>

      <div className="flex gap-3">
        {accessCheck.reason === "no_token" && onSignIn && (
          <button
            onClick={onSignIn}
            className="flex items-center gap-2 rounded-lg bg-teal px-4 py-2 text-sm font-medium text-teal-foreground transition-all duration-200 hover:bg-teal/90"
          >
            <GitBranch className="h-4 w-4" />
            Sign in with GitHub
          </button>
        )}

        {accessCheck.reason === "forbidden" && onSignIn && (
          <button
            onClick={onSignIn}
            className="flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground transition-all duration-200 hover:border-teal hover:text-teal"
          >
            <GitBranch className="h-4 w-4" />
            Grant repo access
          </button>
        )}

        {onRetry && (
          <button
            onClick={onRetry}
            className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-muted-foreground transition-all duration-200 hover:border-foreground/20 hover:text-foreground"
          >
            Try again
          </button>
        )}
      </div>
    </div>
  );
}
