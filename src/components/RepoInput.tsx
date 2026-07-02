import { useState } from "react";
import { GitBranch, Loader as Loader2, Search, TriangleAlert as AlertTriangle } from "lucide-react";
import { parseGitHubUrl } from "@/lib/github-api";

interface RepoInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  isLoading: boolean;
  error?: string;
}

export function RepoInput({ value, onChange, onSubmit, isLoading, error }: RepoInputProps) {
  const [isFocused, setIsFocused] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoading && value.trim()) {
      onSubmit();
    }
  };

  const isValid = parseGitHubUrl(value) !== null;
  const hasGitSuffix = /\.git([/?#]|$)/i.test(value.trim());

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className="flex gap-2">
        <div
          className={`relative flex flex-1 items-center rounded-lg border bg-background transition-all duration-200 ${
            isFocused
              ? "border-teal shadow-[0_0_0_3px_rgba(20,184,166,0.15)]"
              : "border-border"
          }`}
        >
          <GitBranch className="absolute left-3 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder="github.com/owner/repo or owner/repo"
            className="h-11 w-full bg-transparent pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            disabled={isLoading}
          />
          {value && !isLoading && (
            <button
              type="button"
              onClick={() => onChange("")}
              className="absolute right-3 text-xs text-muted-foreground hover:text-foreground"
            >
              Clear
            </button>
          )}
        </div>

        <button
          type="submit"
          disabled={isLoading || !value.trim() || !isValid}
          className="flex h-11 w-11 items-center justify-center rounded-lg border border-teal bg-teal text-teal-foreground transition-all duration-200 hover:bg-teal/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Search className="h-4 w-4" />
          )}
        </button>
      </div>

      {error && (
        <p className="mt-2 text-sm text-red-500">{error}</p>
      )}

      {hasGitSuffix && !error && (
        <div className="mt-2 flex items-start gap-2 rounded-md border border-yellow-500/30 bg-yellow-500/5 px-3 py-2">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-yellow-600" />
          <p className="text-xs text-yellow-600">
            Your link ends with <code className="font-mono font-semibold">.git</code>.
            If you have access to this repo, remove the{" "}
            <code className="font-mono font-semibold">.git</code> suffix first —
            the analyzer accepts plain URLs like{" "}
            <code className="font-mono">github.com/owner/repo</code>.
          </p>
        </div>
      )}

      {!isValid && value.trim() && !error && !hasGitSuffix && (
        <p className="mt-2 text-xs text-yellow-600">
          Enter a valid GitHub repository URL (e.g., facebook/react)
        </p>
      )}
    </form>
  );
}
