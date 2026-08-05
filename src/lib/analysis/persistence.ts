/**
 * Unified Persistence Layer
 *
 * Automatically persists analysis results to Supabase with user_id
 * authenticated inserts. Handles node and edge creation in batches
 * using upsert to gracefully handle duplicate labels within a project.
 */

import { supabase } from "../supabase";
import type { AnalysisGraph, AnalysisNode, AnalysisEdge } from "./automated-analysis-engine";

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
    let effectiveUserId = userId;
    if (!effectiveUserId) {
      const { data: { user } } = await supabase.auth.getUser();
      effectiveUserId = user?.id ?? null;
    }

    const projectName = graph.metadata.repo.name || extractRepoName(repoUrl);

    const { data: project, error: projectError } = await supabase
      .from("projects")
      .insert({
        user_id: effectiveUserId,
        name: projectName,
        description: repoUrl,
        workspace: "app",
      })
      .select()
      .single();

    if (projectError || !project) {
      return {
        success: false,
        error: `Failed to create project: ${projectError?.message}`,
      };
    }

    const nodesResult = await batchCreateNodes(project.id, graph.nodes, effectiveUserId);
    if (!nodesResult.success) {
      return nodesResult;
    }

    const edgesResult = await batchCreateEdges(project.id, graph.edges, effectiveUserId);
    if (!edgesResult.success) {
      return edgesResult;
    }

    return {
      success: true,
      projectId: project.id,
      nodesCreated: nodesResult.nodesCreated,
      edgesCreated: edgesResult.edgesCreated,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error during persistence",
    };
  }
}

/**
 * Batch create nodes using upsert with onConflict: "project_id,label"
 * so duplicate labels within the same project update gracefully
 * instead of crashing with a 23505 unique violation.
 */
async function batchCreateNodes(
  projectId: string,
  nodes: AnalysisNode[],
  userId?: string | null
): Promise<PersistenceResult> {
  if (nodes.length === 0) {
    return { success: true, nodesCreated: 0 };
  }

  // Deduplicate by label so the batch never contains two rows with the
  // same (project_id, label) — PostgREST upsert can only resolve
  // conflicts against existing rows, not within the same payload.
  const seenLabels = new Set<string>();
  const nodesToInsert = nodes
    .map((node) => ({
      project_id: projectId,
      user_id: userId ?? null,
      label: node.label,
      sub: node.sub,
      shape: node.shape,
      accent: node.accent,
      x: node.x,
      y: node.y,
      w: null,
      h: null,
      workspace: "app",
      columns: null,
      table_name: null,
    }))
    .filter((n) => {
      if (seenLabels.has(n.label)) return false;
      seenLabels.add(n.label);
      return true;
    });

  const BATCH_SIZE = 100;
  let inserted = 0;

  for (let i = 0; i < nodesToInsert.length; i += BATCH_SIZE) {
    const batch = nodesToInsert.slice(i, i + BATCH_SIZE);

    const { error } = await supabase
      .from("nodes")
      .upsert(batch, { onConflict: "project_id,label", ignoreDuplicates: false });

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
 * Batch create edges using upsert with onConflict: "project_id,from_node,to_node"
 * so duplicate edge pairs within the same project update gracefully.
 */
async function batchCreateEdges(
  projectId: string,
  edges: AnalysisEdge[],
  userId?: string | null
): Promise<PersistenceResult> {
  if (edges.length === 0) {
    return { success: true, edgesCreated: 0 };
  }

  // Deduplicate by (from, to) so the batch never contains two rows with
  // the same edge pair.
  const seenEdges = new Set<string>();
  const edgesToInsert = edges
    .map((edge) => ({
      project_id: projectId,
      user_id: userId ?? null,
      from_node: edge.from,
      to_node: edge.to,
      from_handle: null,
      to_handle: null,
      cardinality: null,
      from_column: null,
      to_column: null,
    }))
    .filter((e) => {
      const key = `${e.from_node}->${e.to_node}`;
      if (seenEdges.has(key)) return false;
      seenEdges.add(key);
      return true;
    });

  const BATCH_SIZE = 100;
  let inserted = 0;

  for (let i = 0; i < edgesToInsert.length; i += BATCH_SIZE) {
    const batch = edgesToInsert.slice(i, i + BATCH_SIZE);

    const { error } = await supabase
      .from("edges")
      .upsert(batch, { onConflict: "project_id,from_node,to_node", ignoreDuplicates: false });

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
        sub: (n.sub as string) ?? "",
        type: "file" as AnalysisNode["type"],
        shape: (n.shape as AnalysisNode["shape"]) ?? "rectangle",
        accent: (n.accent as AnalysisNode["accent"]) ?? "teal",
        x: (n.x as number) ?? 0,
        y: (n.y as number) ?? 0,
      })),
      edges: (edges ?? []).map((e: Record<string, unknown>) => ({
        id: e.id as string,
        from: e.from_node as string,
        to: e.to_node as string,
        kind: "call" as AnalysisEdge["kind"],
      })),
      metadata: {
        repo: {
          id: 0,
          name: project.name,
          full_name: project.name,
          owner: { login: "", avatar_url: "" },
          private: false,
          description: project.description ?? null,
          html_url: project.description ?? "",
          stargazers_count: 0,
          language: null,
          default_branch: "main",
          visibility: "public" as const,
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
    const { error: edgesError } = await supabase
      .from("edges")
      .delete()
      .eq("project_id", projectId);

    if (edgesError) {
      return { success: false, error: `Failed to delete edges: ${edgesError.message}` };
    }

    const { error: nodesError } = await supabase
      .from("nodes")
      .delete()
      .eq("project_id", projectId);

    if (nodesError) {
      return { success: false, error: `Failed to delete nodes: ${nodesError.message}` };
    }

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
