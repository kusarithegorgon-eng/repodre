/**
 * RecentProjectsPanel — Sidebar for recent repository analyses
 *
 * Fetches and displays recent projects from Supabase.
 * Clicking a project loads it into the studio.
 */

import { useState, useEffect, useCallback } from "react";
import { Link } from "@tanstack/react-router";
import { Clock, GitBranch, ArrowRight, FolderOpen, Loader as Loader2, CircleAlert as AlertCircle, RefreshCw } from "lucide-react";
import { listProjects, type Project } from "@/lib/db-client";
import { supabase } from "@/lib/supabase";

interface RecentProjectsPanelProps {
  onSelectProject: (projectId: string) => void;
  refreshKey?: number;
}

export function RecentProjectsPanel({
  onSelectProject,
  refreshKey = 0,
}: RecentProjectsPanelProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProjects = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await listProjects();
      // Filter out demo projects (those with specific IDs) and show only user-created ones
      const userProjects = data.filter(
        (p) => !p.id.startsWith("00000000-0000-0000-0000-00000000000")
      );
      setProjects(userProjects);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load projects");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Refresh when refreshKey changes (e.g. after a new project is saved)
  useEffect(() => {
    fetchProjects();
  }, [refreshKey, fetchProjects]);

  // Refresh when the user logs in or out
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "INITIAL_SESSION") {
        fetchProjects();
      }
    });
    return () => subscription.unsubscribe();
  }, [fetchProjects]);

  const formatDate = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor(diff / (1000 * 60));

    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  const extractRepoName = (project: Project) => {
    // Extract repo name from description if available
    // Format: "Dependency graph for owner/repo"
    if (project.description) {
      const match = project.description.match(/for\s+(.+)/i);
      if (match) return match[1];
    }
    return project.name;
  };

  return (
    <div className="flex w-72 flex-col border-r border-border bg-surface">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">Recent Projects</h3>
        </div>
        <button
          onClick={fetchProjects}
          disabled={isLoading}
          title="Refresh projects list"
          className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-2">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
            <p className="mt-2 text-xs">Loading projects...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-8 text-red-500">
            <AlertCircle className="h-6 w-6" />
            <p className="mt-2 text-xs text-center">{error}</p>
            <button
              onClick={fetchProjects}
              className="mt-2 text-xs text-muted-foreground hover:text-foreground"
            >
              Try again
            </button>
          </div>
        ) : projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <FolderOpen className="h-8 w-8 text-muted-foreground/40" />
            <p className="mt-3 text-sm font-medium text-muted-foreground">
              No recent projects
            </p>
            <p className="mt-1 text-xs text-muted-foreground/60 max-w-[200px]">
              Analyze a GitHub repository to see it here
            </p>
          </div>
        ) : (
          <ul className="space-y-1">
            {projects.map((project) => (
              <li key={project.id}>
                <button
                  onClick={() => onSelectProject(project.id)}
                  className="group flex w-full items-center gap-3 rounded-lg border border-transparent px-3 py-2.5 text-left transition-all hover:border-border hover:bg-accent/50"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal/10 text-teal">
                    <GitBranch className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground group-hover:text-teal">
                      {project.name}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {extractRepoName(project)}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-0.5">
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                    <span className="text-[10px] text-muted-foreground/60">
                      {formatDate(project.updatedAt)}
                    </span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-border px-4 py-2">
        <p className="text-[10px] text-muted-foreground">
          {projects.length > 0
            ? `${projects.length} project${projects.length !== 1 ? "s" : ""} saved`
            : "Projects sync to your workspace"}
        </p>
      </div>
    </div>
  );
}

/**
 * Getting Started Overlay
 * Shows when canvas is empty with step-by-step instructions.
 */
export function GettingStartedOverlay() {
  const steps = [
    {
      step: 1,
      title: "Connect",
      description: "Paste a GitHub repository URL to establish a secure, read-only link.",
      icon: GitBranch,
    },
    {
      step: 2,
      title: "Parse",
      description: "We automatically scan for routes, controllers, and database schemas.",
      icon: FolderOpen,
    },
    {
      step: 3,
      title: "Sync",
      description: "Save your map to your private workspace for later access.",
      icon: RefreshCw,
    },
    {
      step: 4,
      title: "Explore",
      description: "Click nodes to inspect code logic and trace data flow.",
      icon: ArrowRight,
    },
  ];

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="mx-4 max-w-md rounded-2xl border border-border bg-surface p-6 shadow-xl">
        <div className="mb-4 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-teal/10 text-teal">
            <GitBranch className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-semibold text-foreground">Getting Started</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Visualize your codebase in 4 simple steps
          </p>
        </div>

        <div className="space-y-3">
          {steps.map((s) => (
            <div
              key={s.step}
              className="flex items-start gap-3 rounded-lg border border-border bg-background/50 px-4 py-3"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal/10 text-xs font-bold text-teal">
                {s.step}
              </span>
              <div className="flex-1">
                <h3 className="text-sm font-medium text-foreground">{s.title}</h3>
                <p className="text-xs text-muted-foreground">{s.description}</p>
              </div>
            </div>
          ))}
        </div>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Enter a repository URL on the right to begin
        </p>
      </div>
    </div>
  );
}
