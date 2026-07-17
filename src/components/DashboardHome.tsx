import { useCallback, useState } from "react";
import { Sparkles } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { RepoInput } from "@/components/RepoInput";
import { AnalysisProgress } from "@/components/AnalysisProgress";
import { AccessRestrictedState } from "@/components/AccessRestrictedState";
import { analyzeRepository, type AnalysisResult, type AnalysisProgress as AnalysisProgressType } from "@/lib/repository-analyzer";
import { createProject, batchCreateNodes, batchCreateEdges } from "@/lib/db-client";
import { supabase } from "@/lib/supabase";
import { parseGitHubUrl } from "@/lib/github-api";
import type { HandleSegment } from "@/lib/canvas-geometry";

export function DashboardHome() {
  const navigate = useNavigate();
  const [repoUrl, setRepoUrl] = useState("");
  const [patToken, setPatToken] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progress, setProgress] = useState<AnalysisProgressType | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "error" | "info" } | null>(null);

  const showToast = useCallback((message: string, type: "error" | "info" = "error") => {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 6000);
  }, []);

  const handleAnalyze = useCallback(async () => {
    if (!repoUrl.trim() || isAnalyzing) return;

    const trimmedUrl = repoUrl.trim();
    const parsed = parseGitHubUrl(trimmedUrl);
    if (!parsed) {
      const msg = "Invalid repository URL. Expected format: github.com/owner/repo or owner/repo";
      setError(msg);
      showToast(msg);
      return;
    }

    setIsAnalyzing(true);
    setError(null);
    setResult(null);

    try {
      const analysisResult = await analyzeRepository(trimmedUrl, setProgress, {
        maxFiles: 100,
      });

      setResult(analysisResult);

      if (analysisResult.success && analysisResult.graph) {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          const userId = user?.id ?? null;

          const project = await createProject({
            name: analysisResult.repo?.name || "Untitled Project",
            description: `Dependency graph for ${analysisResult.repo?.full_name || trimmedUrl}`,
            zoom: 100,
            autoLayout: true,
            smartRoute: true,
            workspace: "app",
            schemaSource: null,
            userId,
          });

          const savedNodes = await batchCreateNodes(
            project.id,
            analysisResult.graph.nodes.map((n) => ({
              label: n.label,
              sub: n.sub,
              shape: n.shape,
              accent: n.accent,
              x: n.x,
              y: n.y,
              workspace: "app" as const,
              columns: null,
              tableName: null,
              userId,
            }))
          );

          const nodeIdMap = new Map<string, string>();
          analysisResult.graph.nodes.forEach((n, i) => {
            nodeIdMap.set(n.id, savedNodes[i]?.id || "");
          });

          await batchCreateEdges(
            project.id,
            analysisResult.graph.edges.map((e) => ({
              from: nodeIdMap.get(e.from) || e.from,
              to: nodeIdMap.get(e.to) || e.to,
              fromHandle: e.fromHandle as HandleSegment | undefined,
              toHandle: e.toHandle as HandleSegment | undefined,
            }))
          );

          navigate({ to: "/dashboard", search: { project: project.id } });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error("Database save failed, falling back to draft:", err);
          showToast(`Database save failed: ${message}`, "error");
          sessionStorage.setItem(
            "repodre-draft-graph",
            JSON.stringify({
              nodes: analysisResult.graph.nodes,
              edges: analysisResult.graph.edges,
              repoName: analysisResult.repo?.name || "Analysis Result",
            })
          );
          navigate({ to: "/dashboard", search: { draft: true } });
        }
      } else if (!analysisResult.success) {
        if (analysisResult.accessIssue) {
          setError(analysisResult.accessIssue.message);
          showToast(analysisResult.accessIssue.message);
        } else {
          const msg = analysisResult.error || "Analysis failed";
          setError(msg);
          showToast("Parsing failed. Please ensure the repository is public and accessible.");
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "An unexpected error occurred";
      setError(message);
      showToast("Parsing failed. Please ensure the repository is public and accessible.");
    } finally {
      setIsAnalyzing(false);
      setProgress(null);
    }
  }, [repoUrl, isAnalyzing, navigate, showToast]);

  const handleSyncToDatabase = useCallback(() => {
    showToast("Sync to Database is available after analysis.", "info");
  }, [showToast]);

  const isProgress = progress && progress.phase !== "complete" && progress.phase !== "error";

  return (
    <div className="flex min-h-[80vh] flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-2xl space-y-6 text-center">
        <div className="space-y-6">
          <div>
            <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
              Visualize Your Codebase
            </h1>
            <p className="mt-3 text-4xl font-semibold text-teal sm:text-5xl">
              Execution Architecture
            </p>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-muted-foreground sm:text-base">
              Paste any GitHub repository URL and instantly generate an interactive execution flow diagram and database ERD blueprint.
            </p>
          </div>
        </div>

        <div className="mx-auto w-full max-w-2xl space-y-6">
          <RepoInput
            value={repoUrl}
            onChange={setRepoUrl}
            onSubmit={handleAnalyze}
            isLoading={isAnalyzing}
            error={error ?? undefined}
          />

          <input
            type="text"
            value={patToken}
            onChange={(e) => setPatToken(e.target.value)}
            placeholder="Enter GitHub Personal Access Token (Optional)"
            className="h-12 w-full rounded-2xl border border-border bg-background/80 px-4 text-sm text-foreground outline-none transition focus:border-teal"
          />

          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <button
              type="button"
              onClick={handleAnalyze}
              disabled={isAnalyzing || !repoUrl.trim()}
              className="inline-flex min-w-[11rem] items-center justify-center rounded-2xl bg-teal px-6 py-3 text-sm font-semibold text-teal-foreground transition hover:bg-teal/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isAnalyzing ? "Analyzing…" : "Start analysis"}
            </button>
            <button
              type="button"
              onClick={() => navigate({ to: "/dashboard", search: { demo: true } })}
              className="inline-flex min-w-[11rem] items-center justify-center rounded-2xl border border-border bg-background px-6 py-3 text-sm font-semibold text-foreground transition hover:border-teal hover:text-teal"
            >
              View Demo Project
            </button>
            <button
              type="button"
              onClick={handleSyncToDatabase}
              className="inline-flex min-w-[11rem] items-center justify-center rounded-2xl border border-border bg-background px-6 py-3 text-sm font-semibold text-foreground transition hover:border-teal hover:text-teal"
            >
              Sync to Database
            </button>
          </div>

          {isProgress && progress && (
            <div className="rounded-2xl bg-background/70 p-4">
              <AnalysisProgress progress={progress} />
            </div>
          )}

          {result?.accessIssue && !result.success && (
            <AccessRestrictedState
              accessCheck={result.accessIssue}
              onRetry={handleAnalyze}
              onSignIn={() => navigate({ to: "/dashboard" })}
            />
          )}
        </div>

        {toast && (
          <div className="pointer-events-none fixed bottom-6 right-6 z-50 rounded-3xl border border-border bg-background/95 p-4 text-sm shadow-xl shadow-black/10">
            <p className={`font-medium ${toast.type === "error" ? "text-red-500" : "text-teal"}`}>{toast.message}</p>
          </div>
        )}
      </div>
    </div>
  );
}
