import { Link, useNavigate } from "@tanstack/react-router";
import { useState, useCallback } from "react";
import { GitBranch, Sparkles, Zap, Shield, Globe, ArrowRight, Database, CircleAlert as AlertCircle, X, Menu, FolderOpen } from "lucide-react";
import { RepodreLogo } from "@/components/RepodreLogo";
import { AuthButton } from "@/components/AuthButton";
import { RepoInput } from "@/components/RepoInput";
import { AnalysisProgress } from "@/components/AnalysisProgress";
import { AccessRestrictedState } from "@/components/AccessRestrictedState";
import { ThemeToggle } from "@/components/ThemeToggle";
import { PrivacyShield } from "@/components/PrivacyShield";
import { AiDisclosureBadge } from "@/components/AiDisclosureBadge";
import { RecentProjectsPanel } from "@/components/RecentProjectsPanel";
import { analyzeRepository, type AnalysisResult, type AnalysisProgress as AnalysisProgressType } from "@/lib/repository-analyzer";
import { signInWithGitHub } from "@/lib/github-auth";
import { createProject, batchCreateNodes, batchCreateEdges, syncRepoToSupabase } from "@/lib/db-client";
import { supabase } from "@/lib/supabase";
import type { HandleSegment } from "@/lib/canvas-geometry";
import { parseRepository } from "@/utils/github-parser";
import { parseGitHubUrl } from "@/lib/github-api";

export function HomePage() {
  const navigate = useNavigate();
  const [repoUrl, setRepoUrl] = useState("");
  const [patToken, setPatToken] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progress, setProgress] = useState<AnalysisProgressType | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [toast, setToast] = useState<{ message: string; type: "error" | "info" } | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const showToast = useCallback((message: string, type: "error" | "info" = "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 6000);
  }, []);

  const handleSelectProject = useCallback((projectId: string) => {
    navigate({ to: "/studio", search: { project: projectId } });
  }, [navigate]);

  // Test function for github-parser
  const handleTestParser = useCallback(async () => {
    const sampleUrl = "https://github.com/vercel/next.js";
    console.log("Testing parseRepository with:", sampleUrl);
    console.log("Using token:", patToken ? "provided" : "none");
    const parseResult = await parseRepository(sampleUrl, patToken || undefined);
    console.log("Parse result:", parseResult);
    if (parseResult.success && parseResult.files) {
      console.log(`Successfully parsed ${parseResult.files.length} files`);
    } else {
      console.log("Parse failed:", parseResult.error);
    }
  }, [patToken]);

  // Sync parsed files to Supabase
  const handleSyncToDatabase = useCallback(async () => {
    const sampleUrl = "https://github.com/vercel/next.js";
    setSyncStatus("Parsing repository...");
    console.log("Sync to Database: parsing", sampleUrl);

    const parseResult = await parseRepository(sampleUrl, patToken || undefined);

    if (!parseResult.success || !parseResult.files) {
      setSyncStatus(`Parse failed: ${parseResult.error}`);
      console.error("Sync failed:", parseResult.error);
      return;
    }

    setSyncStatus(`Found ${parseResult.files.length} files. Creating project...`);

    try {
      // Create a new project for the sync
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id ?? null;

      const project = await createProject({
        name: "next.js",
        description: `Synced from ${sampleUrl}`,
        zoom: 100,
        autoLayout: true,
        smartRoute: true,
        workspace: "app",
        schemaSource: null,
        userId,
      });

      setSyncStatus(`Syncing ${parseResult.files.length} files to database...`);

      // Sync files to Supabase
      const syncResult = await syncRepoToSupabase(project.id, parseResult.files, userId);

      if (syncResult.success) {
        setSyncStatus(`Success! ${syncResult.count} nodes synced. Loading canvas...`);
        console.log(`Sync complete: ${syncResult.count} nodes pushed to database`);

        // Auto-navigate to the studio page with the newly synced project
        navigate({ to: "/studio", search: { project: project.id } });
      } else {
        setSyncStatus(`Sync failed: ${syncResult.error}`);
        console.error("Sync failed:", syncResult.error);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setSyncStatus(`Error: ${message}`);
      console.error("Sync error:", message);
    }
  }, [patToken]);

  const handleAnalyze = useCallback(async () => {
    if (!repoUrl.trim() || isAnalyzing) return;

    // Input validation: check URL format before starting parse
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
          // Save the project to the database
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

          // Save nodes — include all required fields with explicit defaults
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

          setRefreshKey((k) => k + 1);
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
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* Header */}
      <header className="flex h-14 items-center justify-between border-b border-border px-4 md:px-6">
        <div className="flex items-center gap-2">
          {/* Mobile menu button */}
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-border md:hidden hover:bg-surface"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <Link to="/" className="flex items-center gap-2.5">
            <RepodreLogo className="h-8 w-8" />
            <span className="font-display text-sm font-semibold tracking-tight">Repodre</span>
          </Link>
        </div>
        <div className="flex items-center gap-2">
          <AiDisclosureBadge />
          <ThemeToggle />
          <AuthButton />
        </div>
      </header>

      {/* Mobile Projects Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setMobileMenuOpen(false)}
          />
          {/* Drawer */}
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-surface border-r border-border shadow-xl">
            <div className="flex h-14 items-center justify-between border-b border-border px-4">
              <div className="flex items-center gap-2">
                <FolderOpen className="h-5 w-5 text-teal" />
                <span className="text-sm font-medium">Recent Projects</span>
              </div>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-background"
                aria-label="Close menu"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="h-[calc(100%-3.5rem)] overflow-y-auto">
              <RecentProjectsPanel
                onSelectProject={(id) => {
                  handleSelectProject(id);
                  setMobileMenuOpen(false);
                }}
                refreshKey={refreshKey}
              />
            </div>
          </div>
        </div>
      )}

      {/* Toast notification */}
      {toast && (
        <div className="fixed top-16 right-4 z-50 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 shadow-lg backdrop-blur-sm">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
          <p className="flex-1 text-sm font-medium text-red-500">{toast.message}</p>
          <button
            onClick={() => setToast(null)}
            className="flex h-5 w-5 items-center justify-center rounded-md text-muted-foreground hover:bg-red-500/10 hover:text-red-500"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Privacy Shield banner */}
      <PrivacyShield />

      {/* Main Content with Sidebar */}
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {/* Recent Projects Sidebar — fixed width on desktop, hidden on mobile */}
        <aside className="hidden md:block absolute inset-y-0 left-0 w-72 shrink-0 border-r border-border bg-surface">
          <RecentProjectsPanel
            onSelectProject={handleSelectProject}
            refreshKey={refreshKey}
          />
        </aside>

        {/* Hero — centered regardless of sidebar content */}
        <main className="flex flex-1 flex-col items-center justify-center overflow-y-auto px-6 py-12 md:ml-72">
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

              {/* PAT Input */}
              <div className="mt-3">
                <input
                  type="password"
                  placeholder="Enter GitHub Personal Access Token (Optional)"
                  value={patToken}
                  onChange={(e) => setPatToken(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
                />
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Required for private repos. Needs 'repo' scope.
                </p>
              </div>

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
          <div className="flex flex-col items-center gap-3">
            <Link
              to="/studio"
              className="inline-flex items-center gap-2 rounded-lg bg-surface border border-border px-4 py-2 text-sm font-medium text-foreground transition-all duration-200 hover:border-teal hover:text-teal"
            >
              View Demo Project
              <ArrowRight className="h-4 w-4" />
            </Link>

            {/* Test button for github-parser */}
            <button
              onClick={handleTestParser}
              className="inline-flex items-center gap-2 rounded-lg bg-teal/10 border border-teal/30 px-4 py-2 text-sm font-medium text-teal transition-all duration-200 hover:bg-teal/20"
            >
              Test GitHub Parser
              <GitBranch className="h-4 w-4" />
            </button>

            {/* Sync to Database button */}
            <button
              onClick={handleSyncToDatabase}
              className="inline-flex items-center gap-2 rounded-lg bg-blue/10 border border-blue/30 px-4 py-2 text-sm font-medium text-blue transition-all duration-200 hover:bg-blue/20"
            >
              Sync to Database
              <Database className="h-4 w-4" />
            </button>
            {syncStatus && (
              <p className="text-xs text-muted-foreground">{syncStatus}</p>
            )}
            <p className="text-xs text-muted-foreground">
              Click to sync repository files to Supabase database (check console for output)
            </p>
          </div>
        </div>
      </main>
      </div>

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
