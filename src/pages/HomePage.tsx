import { Link, useNavigate } from "@tanstack/react-router";
import { useState, useCallback } from "react";
import {
  GitBranch,
  Sparkles,
  Zap,
  Shield,
  Globe,
  ArrowRight,
} from "lucide-react";
import { RepodreLogo } from "@/components/RepodreLogo";
import { AuthButton } from "@/components/AuthButton";
import { RepoInput } from "@/components/RepoInput";
import { AnalysisProgress } from "@/components/AnalysisProgress";
import { AccessRestrictedState } from "@/components/AccessRestrictedState";
import { ThemeToggle } from "@/components/ThemeToggle";
import { PrivacyShield } from "@/components/PrivacyShield";
import { AiDisclosureBadge } from "@/components/AiDisclosureBadge";
import { analyzeRepository, type AnalysisResult, type AnalysisProgress as AnalysisProgressType } from "@/lib/repository-analyzer";
import { signInWithGitHub } from "@/lib/github-auth";
import { createProject, batchCreateNodes, batchCreateEdges } from "@/lib/db-client";
import type { HandleSegment } from "@/lib/canvas-geometry";

export function HomePage() {
  const navigate = useNavigate();
  const [repoUrl, setRepoUrl] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progress, setProgress] = useState<AnalysisProgressType | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = useCallback(async () => {
    if (!repoUrl.trim() || isAnalyzing) return;

    setIsAnalyzing(true);
    setError(null);
    setResult(null);

    try {
      const analysisResult = await analyzeRepository(repoUrl, setProgress, {
        maxFiles: 100,
      });

      setResult(analysisResult);

      if (analysisResult.success && analysisResult.graph) {
        try {
          // Save the project to the database (requires authentication)
          const project = await createProject({
            name: analysisResult.repo?.name || "Untitled Project",
            description: `Dependency graph for ${analysisResult.repo?.full_name || repoUrl}`,
            zoom: 100,
            autoLayout: true,
            smartRoute: true,
          });

          // Save nodes
          const savedNodes = await batchCreateNodes(
            project.id,
            analysisResult.graph.nodes.map((n) => ({
              label: n.label,
              sub: n.sub,
              shape: n.shape,
              accent: n.accent,
              x: n.x,
              y: n.y,
            }))
          );

          // Create a mapping from generated IDs to DB IDs for edges
          const nodeIdMap = new Map<string, string>();
          analysisResult.graph.nodes.forEach((n, i) => {
            nodeIdMap.set(n.id, savedNodes[i].id);
          });

          // Save edges
          await batchCreateEdges(
            project.id,
            analysisResult.graph.edges.map((e) => ({
              from: nodeIdMap.get(e.from) || e.from,
              to: nodeIdMap.get(e.to) || e.to,
              fromHandle: e.fromHandle as HandleSegment | undefined,
              toHandle: e.toHandle as HandleSegment | undefined,
            }))
          );

          navigate({ to: "/studio", search: { project: project.id } });
        } catch {
          // DB save failed (user not signed in or constraint error) — open in-memory
          sessionStorage.setItem("repodre-draft-graph", JSON.stringify({
            nodes: analysisResult.graph.nodes,
            edges: analysisResult.graph.edges,
            repoName: analysisResult.repo?.name || "Analysis Result",
          }));
          navigate({ to: "/studio", search: { draft: true } });
        }
      } else if (!analysisResult.success) {
        if (analysisResult.accessIssue) {
          setError(analysisResult.accessIssue.message);
        } else {
          setError(analysisResult.error || "Analysis failed");
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setIsAnalyzing(false);
      setProgress(null);
    }
  }, [repoUrl, isAnalyzing, navigate]);

  const isProgress = progress && progress.phase !== "complete" && progress.phase !== "error";

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* Header */}
      <header className="flex h-14 items-center justify-between border-b border-border px-6">
        <Link to="/" className="flex items-center gap-2.5">
          <RepodreLogo className="h-8 w-8" />
          <span className="font-display text-sm font-semibold tracking-tight">Repodre</span>
        </Link>
        <div className="flex items-center gap-2">
          <AiDisclosureBadge />
          <ThemeToggle />
          <AuthButton />
        </div>
      </header>

      {/* Privacy Shield banner */}
      <PrivacyShield />

      {/* Hero */}
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-12">
        <div className="mx-auto max-w-2xl text-center">
          <div className="mb-6 flex items-center justify-center gap-2">
            <Sparkles className="h-5 w-5 text-teal" />
            <span className="text-sm font-medium text-teal">Execution Flow Mapper</span>
          </div>

          <h1 className="mb-4 text-4xl font-bold leading-tight tracking-tight">
            Visualize Your Codebase
            <br />
            <span className="text-teal">
              Execution Architecture
            </span>
          </h1>

          <p className="mb-8 text-lg text-muted-foreground">
            Paste any GitHub repository URL and instantly generate an interactive
            execution flow diagram and database ERD blueprint — with Crow's Foot
            notation, multi-engine SQL export, and a FigJam-inspired canvas.
          </p>

          {/* Repository Input */}
          {!isProgress && !result?.accessIssue && (
            <div className="mx-auto mb-8 max-w-md">
              <RepoInput
                value={repoUrl}
                onChange={setRepoUrl}
                onSubmit={handleAnalyze}
                isLoading={isAnalyzing}
                error={error ?? undefined}
              />

              <p className="mt-3 text-xs text-muted-foreground">
                Try:{" "}
                <button
                  onClick={() => setRepoUrl("vercel/next.js")}
                  className="text-teal hover:underline"
                >
                  vercel/next.js
                </button>
                ,{" "}
                <button
                  onClick={() => setRepoUrl("supabase/supabase")}
                  className="text-teal hover:underline"
                >
                  supabase/supabase
                </button>
                , or your own repo
              </p>
            </div>
          )}

          {/* Analysis Progress */}
          {isProgress && progress && (
            <div className="mx-auto mb-8 max-w-md">
              <AnalysisProgress progress={progress} />
              <button
                onClick={() => {
                  setIsAnalyzing(false);
                  setProgress(null);
                }}
                className="mt-4 text-sm text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
            </div>
          )}

          {/* Access Restricted State */}
          {result?.accessIssue && !result.success && (
            <div className="mx-auto mb-8 max-w-md">
              <AccessRestrictedState
                accessCheck={result.accessIssue}
                onRetry={handleAnalyze}
                onSignIn={signInWithGitHub}
              />
            </div>
          )}
        </div>

        {/* Demo Link */}
        <div className="mt-12 text-center">
          <p className="mb-4 text-sm text-muted-foreground">
            Want to see it in action?
          </p>
          <Link
            to="/studio"
            className="inline-flex items-center gap-2 rounded-lg bg-surface border border-border px-4 py-2 text-sm font-medium text-foreground transition-all duration-200 hover:border-teal hover:text-teal"
          >
            View Demo Project
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </main>

      {/* Features Grid */}
      <section className="border-t border-border bg-surface/50 px-6 py-16">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-8 text-center text-lg font-semibold text-muted-foreground">
            Built for Modern Development
          </h2>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            <FeatureCard
              icon={<GitBranch className="h-5 w-5" />}
              title="GitHub Integration"
              description="Connect directly to any public or private repository you have access to."
            />
            <FeatureCard
              icon={<Zap className="h-5 w-5" />}
              title="Instant Analysis"
              description="Client-side AST parsing extracts dependencies in milliseconds, not minutes."
            />
            <FeatureCard
              icon={<Shield className="h-5 w-5" />}
              title="Privacy First"
              description="Your code never leaves the browser. Analysis happens entirely client-side."
            />
            <FeatureCard
              icon={<Globe className="h-5 w-5" />}
              title="Framework Aware"
              description="Recognizes Next.js, React, Node, and more to generate intelligent layouts."
            />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border px-6 py-6 text-center text-xs text-muted-foreground">
        <div className="flex items-center justify-center gap-4">
          <Link to="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link>
          <span className="text-border">·</span>
          <Link to="/terms" className="hover:text-foreground transition-colors">Terms of Service</Link>
          <span className="text-border">·</span>
          <span>Built with React and Supabase</span>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-background/50 p-4 text-left transition-all duration-200 hover:border-teal/50">
      <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-teal/10 text-teal">
        {icon}
      </div>
      <h3 className="mb-1 text-sm font-medium text-foreground">{title}</h3>
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  );
}
