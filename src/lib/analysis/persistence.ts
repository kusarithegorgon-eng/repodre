/**
 * Unified Persistence Layer
 *
 * Automatically persists analysis results to Supabase with user_id
 * authenticated inserts. Handles node and edge creation in batches.
 */

import { supabase } from "../supabase";
import type { AnalysisGraph, AnalysisNode, AnalysisEdge } from "./automated-analysis-engine";

export interface PersistedProject {
  id: string;
  user_id: string | null;
  name: string;
  repo_url: string;
  created_at: string;
  updated_at: string;
}

export interface PersistedNode {
  id: string;
  project_id: string;
  user_id: string | null;
  label: string;
  sub: string;
  type: string;
  shape: string;
  accent: string;
  x: number;
  y: number;
  workspace: string;
  source_path?: string;
  line?: number;
  metadata?: Record<string, unknown>;
}

export interface PersistedEdge {
  id: string;
  project_id: string;
  user_id: string | null;
  from_node_id: string;
  to_node_id: string;
  label?: string;
  kind: string;
}

export interface PersistenceResult {
  success: boolean;
  projectId?: string;
  nodesCreated?: number;
  edgesCreated?: number;
  error?: string;
}

/**
 * Persist an analysis graph to Supabase.
 */
export async function persistAnalysisGraph(
  graph: AnalysisGraph,
  repoUrl: string,
  userId?: string | null
): Promise<PersistenceResult> {
  try {
    // Get current user if not provided
    let effectiveUserId = userId;
    if (!effectiveUserId) {
      const { data: { user } } = await supabase.auth.getUser();
      effectiveUserId = user?.id ?? null;
    }

    // Create project
    const projectName = graph.metadata.repo.name || extractRepoName(repoUrl);

    const { data: project, error: projectError } = await supabase
      .from("projects")
      .insert({
        user_id: effectiveUserId,
        name: projectName,
        repo_url: repoUrl,
      })
      .select()
      .single();

    if (projectError || !project) {
      return {
        success: false,
        error: `Failed to create project: ${projectError?.message}`,
      };
    }

    // Batch create nodes
    const nodesResult = await batchCreateNodes(project.id, graph.nodes, effectiveUserId);
    if (!nodesResult.success) {
      return nodesResult;
    }

    // Batch create edges
    const edgesResult = await batchCreateEdges(project.id, graph.edges, effectiveUserId);
    if (!edgesResult.success) {
      return edgesResult;
    }

    return {
      success: true,
      projectId: project.id,
      nodesCreated: graph.nodes.length,
      edgesCreated: graph.edges.length,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error during persistence",
    };
  }
}

/**
 * Batch create nodes with user_id authentication.
 */
async function batchCreateNodes(
  projectId: string,
  nodes: AnalysisNode[],
  userId?: string | null
): Promise<PersistenceResult> {
  if (nodes.length === 0) {
    return { success: true, nodesCreated: 0 };
  }

  const nodesToInsert = nodes.map((node) => ({
    project_id: projectId,
    user_id: userId ?? null,
    label: node.label,
    sub: node.sub,
    type: node.type,
    shape: node.shape,
    accent: node.accent,
    x: node.x,
    y: node.y,
    workspace: "app",
    source_path: node.sourcePath,
    line: node.line,
    metadata: node.metadata,
  }));

  // Insert in batches of 100 to avoid payload limits
  const BATCH_SIZE = 100;
  let inserted = 0;

  for (let i = 0; i < nodesToInsert.length; i += BATCH_SIZE) {
    const batch = nodesToInsert.slice(i, i + BATCH_SIZE);

    const { error } = await supabase.from("nodes").insert(batch);

    if (error) {
      return {
        success: false,
        error: `Failed to create nodes: ${error.message}`,
      };
    }

    inserted += batch.length;
  }

  return { success: true, nodesCreated: inserted };
}

/**
 * Batch create edges with user_id authentication.
 */
async function batchCreateEdges(
  projectId: string,
  edges: AnalysisEdge[],
  userId?: string | null
): Promise<PersistenceResult> {
  if (edges.length === 0) {
    return { success: true, edgesCreated: 0 };
  }

  const edgesToInsert = edges.map((edge) => ({
    project_id: projectId,
    user_id: userId ?? null,
    from_node_id: edge.from,
    to_node_id: edge.to,
    label: edge.label,
    kind: edge.kind,
  }));

  // Insert in batches of 100
  const BATCH_SIZE = 100;
  let inserted = 0;

  for (let i = 0; i < edgesToInsert.length; i += BATCH_SIZE) {
    const batch = edgesToInsert.slice(i, i + BATCH_SIZE);

    const { error } = await supabase.from("edges").insert(batch);

    if (error) {
      return {
        success: false,
        error: `Failed to create edges: ${error.message}`,
      };
    }

    inserted += batch.length;
  }

  return { success: true, edgesCreated: inserted };
}

/**
 * Extract repository name from URL.
 */
function extractRepoName(url: string): string {
  const match = url.match(/github\.com\/[^/]+\/([^/]+)/);
  return match ? match[1] : url;
}

/**
 * Load a persisted project and its graph.
 */
export async function loadPersistedGraph(
  projectId: string
): Promise<{ success: boolean; graph?: AnalysisGraph; error?: string }> {
  try {
    // Load project
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select()
      .eq("id", projectId)
      .single();

    if (projectError || !project) {
      return {
        success: false,
        error: `Project not found: ${projectError?.message}`,
      };
    }

    // Load nodes
    const { data: nodes, error: nodesError } = await supabase
      .from("nodes")
      .select()
      .eq("project_id", projectId);

    if (nodesError) {
      return {
        success: false,
        error: `Failed to load nodes: ${nodesError.message}`,
      };
    }

    // Load edges
    const { data: edges, error: edgesError } = await supabase
      .from("edges")
      .select()
      .eq("project_id", projectId);

    if (edgesError) {
      return {
        success: false,
        error: `Failed to load edges: ${edgesError.message}`,
      };
    }

    const graph: AnalysisGraph = {
      nodes: (nodes ?? []).map((n: Record<string, unknown>) => ({
        id: n.id as string,
        label: n.label as string,
        sub: n.sub as string,
        type: n.type as AnalysisNode["type"],
        shape: n.shape as AnalysisNode["shape"],
        accent: n.accent as AnalysisNode["accent"],
        x: n.x as number,
        y: n.y as number,
        sourcePath: n.source_path as string | undefined,
        line: n.line as number | undefined,
        metadata: n.metadata as Record<string, unknown> | undefined,
      })),
      edges: (edges ?? []).map((e: Record<string>) => ({
        id: e.id as string,
        from: e.from_node_id as string,
        to: e.to_node_id as string,
        label: e.label as string | undefined,
        kind: e.kind as AnalysisEdge["kind"],
      })),
      metadata: {
        repo: {
          owner: "",
          name: project.name,
          full_name: project.name,
          html_url: project.repo_url,
          description: null,
          language: null,
        },
        branch: "main",
        filesParsed: nodes?.length ?? 0,
        totalFiles: nodes?.length ?? 0,
        languageStats: new Map(),
        duration: 0,
        errors: [],
      },
    };

    return { success: true, graph };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error loading graph",
    };
  }
}

/**
 * Delete a persisted project and all its data.
 */
export async function deletePersistedProject(
  projectId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Delete edges first (due to foreign key constraints)
    const { error: edgesError } = await supabase
      .from("edges")
      .delete()
      .eq("project_id", projectId);

    if (edgesError) {
      return { success: false, error: `Failed to delete edges: ${edgesError.message}` };
    }

    // Delete nodes
    const { error: nodesError } = await supabase
      .from("nodes")
      .delete()
      .eq("project_id", projectId);

    if (nodesError) {
      return { success: false, error: `Failed to delete nodes: ${nodesError.message}` };
    }

    // Delete project
    const { error: projectError } = await supabase
      .from("projects")
      .delete()
      .eq("id", projectId);

    if (projectError) {
      return { success: false, error: `Failed to delete project: ${projectError.message}` };
    }

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error deleting project",
    };
  }
}
