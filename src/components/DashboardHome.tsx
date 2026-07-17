import { useCallback, useState } from "react";
import { ArrowRight, Database, GitBranch, Shield, Sparkles } from "lucide-react";
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

  const isProgress = progress && progress.phase !== "complete" && progress.phase !== "error";

  return (
    <div className="flex min-h-full items-center justify-center px-6 py-12">
      <div className="w-full max-w-4xl rounded-[2rem] border border-border bg-background/90 p-8 shadow-2xl shadow-black/5 sm:p-12">
        <div className="grid gap-8 lg:grid-cols-[2fr_1fr] items-start">
          <section className="space-y-6">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-teal/20 bg-teal/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-teal">
                <Sparkles className="h-4 w-4" />
                Repo Paste Home
              </div>
              <div>
                <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                  Paste a GitHub repo URL and launch your workspace.
                </h1>
                <p className="mt-4 text-sm leading-6 text-muted-foreground sm:text-base">
                  Start by connecting a public or private repository, then visualize its execution architecture and database model instantly.
                </p>
              </div>
            </div>

            <div className="space-y-4 rounded-3xl border border-border bg-surface p-6">
              <div className="text-sm font-semibold text-foreground">Analyze a repository</div>
              <RepoInput
                value={repoUrl}
                onChange={setRepoUrl}
                onSubmit={handleAnalyze}
                isLoading={isAnalyzing}
                error={error ?? undefined}
              />
              <div className="space-y-3">
                <input
                  type="password"
                  placeholder="GitHub Personal Access Token (Optional)"
                  value={patToken}
                  onChange={(e) => setPatToken(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal/30"
                />
                <p className="text-xs text-muted-foreground">
                  Required for private repositories. Needs the <span className="font-semibold">repo</span> scope.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={handleAnalyze}
                  disabled={isAnalyzing || !repoUrl.trim()}
                  className="inline-flex items-center justify-center rounded-2xl bg-teal px-4 py-3 text-sm font-semibold text-teal-foreground transition hover:bg-teal/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isAnalyzing ? "Analyzing…" : "Start analysis"}
                </button>
                <button
                  type="button"
                  onClick={() => navigate({ to: "/dashboard", search: { demo: true } })}
                  className="inline-flex items-center justify-center rounded-2xl border border-border bg-background px-4 py-3 text-sm font-semibold text-foreground transition hover:border-teal hover:text-teal"
                >
                  View demo project
                  <ArrowRight className="ml-2 h-4 w-4" />
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
          </section>

          <aside className="space-y-5 rounded-3xl border border-border bg-surface p-6">
            <div className="space-y-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-3xl bg-teal/10 text-teal">
                <GitBranch className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Quick start</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Paste any GitHub repo URL, hit the button, and we’ll map the execution flow.
                </p>
              </div>
            </div>

            <div className="space-y-4 rounded-3xl border border-border bg-background p-4">
              <div className="flex items-center gap-3 text-sm font-semibold text-foreground">
                <Database className="h-4 w-4 text-teal" />
                Workspaces saved automatically
              </div>
              <p className="text-xs leading-5 text-muted-foreground">
                Projects are stored securely in your workspace and appear in Recent Projects on the left.
              </p>
            </div>

            <div className="space-y-4 rounded-3xl border border-border bg-background p-4">
              <div className="flex items-center gap-3 text-sm font-semibold text-foreground">
                <Shield className="h-4 w-4 text-teal" />
                Private by default
              </div>
              <p className="text-xs leading-5 text-muted-foreground">
                Analysis happens locally and only saved data is stored in your workspace.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-border bg-background p-4 text-sm text-muted-foreground">
                <p className="font-semibold text-foreground">Try</p>
                <p className="mt-2">vercel/next.js</p>
              </div>
              <div className="rounded-2xl border border-border bg-background p-4 text-sm text-muted-foreground">
                <p className="font-semibold text-foreground">Or</p>
                <p className="mt-2">supabase/supabase</p>
              </div>
            </div>
          </aside>
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
