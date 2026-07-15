import { supabase } from "./supabase";
import type { NodeData, EdgeData, Workspace } from "./canvas-geometry";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Project {
  id: string;
  name: string;
  description: string | null;
  zoom: number;
  autoLayout: boolean;
  smartRoute: boolean;
  workspace: Workspace;
  schemaSource: string | null;
  createdAt: string;
}

export interface Snapshot {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  nodes: NodeData[];
  edges: EdgeData[];
  createdAt: string;
}

// ─── Projects ─────────────────────────────────────────────────────────────────

export async function listProjects(): Promise<Project[]> {
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(rowToProject);
}

export async function loadFullProject(projectId: string): Promise<{
  project: Project;
  nodes: NodeData[];
  edges: EdgeData[];
} | null> {
  const { data: projRow, error: projErr } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .maybeSingle();
  if (projErr || !projRow) return null;

  const { data: nodeRows, error: nodeErr } = await supabase
    .from("nodes")
    .select("*")
    .eq("project_id", projectId);
  if (nodeErr) throw nodeErr;

  const { data: edgeRows, error: edgeErr } = await supabase
    .from("edges")
    .select("*")
    .eq("project_id", projectId);
  if (edgeErr) throw edgeErr;

  return {
    project: rowToProject(projRow),
    nodes: (nodeRows ?? []).map(rowToNode),
    edges: (edgeRows ?? []).map(rowToEdge),
  };
}

export async function createProject(name: string, workspace: Workspace): Promise<Project> {
  const { data, error } = await supabase
    .from("projects")
    .insert({ name, workspace })
    .select()
    .single();
  if (error) throw error;
  return rowToProject(data);
}

export async function updateProject(projectId: string, updates: Partial<{
  name: string;
  zoom: number;
  autoLayout: boolean;
  smartRoute: boolean;
  schema_source: string;
}>): Promise<void> {
  const { error } = await supabase
    .from("projects")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", projectId);
  if (error) throw error;
}

// ─── Nodes ───────────────────────────────────────────────────────────────────

export async function createNode(projectId: string, node: Partial<NodeData>): Promise<NodeData> {
  const { data, error } = await supabase
    .from("nodes")
    .insert({
      project_id: projectId,
      label: node.label ?? "New Node",
      sub: node.sub ?? "",
      shape: node.shape ?? "rectangle",
      accent: node.accent ?? "teal",
      x: node.x ?? 0,
      y: node.y ?? 0,
      workspace: node.workspace ?? "app",
      table_name: node.tableName,
      columns: node.columns,
    })
    .select()
    .single();
  if (error) throw error;
  return rowToNode(data);
}

export async function updateNode(nodeId: string, updates: Partial<NodeData>): Promise<void> {
  const { error } = await supabase
    .from("nodes")
    .update({
      label: updates.label,
      sub: updates.sub,
      shape: updates.shape,
      accent: updates.accent,
      x: updates.x,
      y: updates.y,
      table_name: updates.tableName,
      columns: updates.columns,
      updated_at: new Date().toISOString(),
    })
    .eq("id", nodeId);
  if (error) throw error;
}

export async function deleteNode(nodeId: string): Promise<void> {
  const { error } = await supabase.from("nodes").delete().eq("id", nodeId);
  if (error) throw error;
}

export async function batchCreateNodes(projectId: string, nodes: Partial<NodeData>[]): Promise<NodeData[]> {
  const rows = nodes.map((n) => ({
    project_id: projectId,
    label: n.label ?? "Node",
    sub: n.sub ?? "",
    shape: n.shape ?? "rectangle",
    accent: n.accent ?? "teal",
    x: n.x ?? 0,
    y: n.y ?? 0,
    workspace: n.workspace ?? "app",
    table_name: n.tableName,
    columns: n.columns,
  }));
  const { data, error } = await supabase.from("nodes").insert(rows).select();
  if (error) throw error;
  return (data ?? []).map(rowToNode);
}

export async function batchUpdateNodePositions(updates: { id: string; x: number; y: number }[]): Promise<void> {
  for (const u of updates) {
    await supabase.from("nodes").update({ x: u.x, y: u.y, updated_at: new Date().toISOString() }).eq("id", u.id);
  }
}

// ─── Edges ───────────────────────────────────────────────────────────────────

export async function createEdge(projectId: string, edge: Partial<EdgeData>): Promise<EdgeData> {
  const { data, error } = await supabase
    .from("edges")
    .insert({
      project_id: projectId,
      from_node: edge.from,
      to_node: edge.to,
      from_handle: edge.fromHandle,
      to_handle: edge.toHandle,
      cardinality: edge.cardinality,
      from_column: edge.fromColumn,
      to_column: edge.toColumn,
    })
    .select()
    .single();
  if (error) throw error;
  return rowToEdge(data);
}

export async function deleteEdge(edgeId: string): Promise<void> {
  const { error } = await supabase.from("edges").delete().eq("id", edgeId);
  if (error) throw error;
}

export async function batchCreateEdges(projectId: string, edges: Partial<EdgeData>[]): Promise<EdgeData[]> {
  const rows = edges.map((e) => ({
    project_id: projectId,
    from_node: e.from,
    to_node: e.to,
    from_handle: e.fromHandle,
    to_handle: e.toHandle,
    cardinality: e.cardinality,
    from_column: e.fromColumn,
    to_column: e.toColumn,
  }));
  const { data, error } = await supabase.from("edges").insert(rows).select();
  if (error) throw error;
  return (data ?? []).map(rowToEdge);
}

// ─── Snapshots ───────────────────────────────────────────────────────────────

export async function listSnapshots(projectId: string): Promise<Snapshot[]> {
  const { data, error } = await supabase
    .from("project_snapshots")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    projectId: r.project_id,
    name: r.name,
    description: r.description,
    nodes: r.nodes ?? [],
    edges: r.edges ?? [],
    createdAt: r.created_at,
  }));
}

export async function createSnapshot(projectId: string, name: string, description: string | null, nodes: NodeData[], edges: EdgeData[]): Promise<Snapshot> {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("project_snapshots")
    .insert({
      project_id: projectId,
      name,
      description,
      nodes,
      edges,
      created_by: user?.id ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return {
    id: data.id,
    projectId: data.project_id,
    name: data.name,
    description: data.description,
    nodes: data.nodes ?? [],
    edges: data.edges ?? [],
    createdAt: data.created_at,
  };
}

export async function deleteSnapshot(snapshotId: string): Promise<void> {
  const { error } = await supabase.from("project_snapshots").delete().eq("id", snapshotId);
  if (error) throw error;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function rowToProject(r: Record<string, unknown>): Project {
  return {
    id: r.id as string,
    name: r.name as string,
    description: r.description as string | null,
    zoom: r.zoom as number,
    autoLayout: r.auto_layout as boolean,
    smartRoute: r.smart_route as boolean,
    workspace: r.workspace as Workspace,
    schemaSource: r.schema_source as string | null,
    createdAt: r.created_at as string,
  };
}

function rowToNode(r: Record<string, unknown>): NodeData {
  return {
    id: r.id as string,
    label: r.label as string,
    sub: r.sub as string,
    shape: r.shape as NodeData["shape"],
    accent: r.accent as NodeData["accent"],
    x: r.x as number,
    y: r.y as number,
    w: r.w as number | undefined,
    h: r.h as number | undefined,
    workspace: r.workspace as Workspace,
    tableName: r.table_name as string | undefined,
    columns: r.columns as ColumnDef[] | undefined,
  };
}

function rowToEdge(r: Record<string, unknown>): EdgeData {
  return {
    id: r.id as string,
    from: r.from_node as string,
    to: r.to_node as string,
    fromHandle: r.from_handle as EdgeData["fromHandle"],
    toHandle: r.to_handle as EdgeData["toHandle"],
    cardinality: r.cardinality as string | undefined,
    fromColumn: r.from_column as string | undefined,
    toColumn: r.to_column as string | undefined,
  };
}

import type { ColumnDef } from "./canvas-geometry";
