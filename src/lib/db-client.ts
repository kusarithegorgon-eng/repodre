/**
 * Database Client for Repodre
 *
 * Provides typed access to the Supabase database for
 * persisting projects, nodes, and edges.
 */

import { supabase } from "./supabase";
import type { Shape, HandleSegment, PositionedNode } from "./canvas-geometry";
import type { Cardinality } from "./sql-tokenizer";
// Re-export so consumers can import from db-client if desired
export type { Cardinality };

async function getUserId(): Promise<string> {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    throw new Error("Authentication required: no active user session");
  }
  return user.id;
}

// Database row types
export interface ProjectRow {
  id: string;
  name: string;
  description: string | null;
  zoom: number;
  auto_layout: boolean;
  smart_route: boolean;
  workspace: "app" | "erd";
  schema_source: string | null;
  created_at: string;
  updated_at: string;
}

export type Accent = "green" | "purple" | "teal" | "blue" | "orange" | "red";

export type Workspace = "app" | "erd";

export interface ErdColumnRow {
  name: string;
  type: string;
  pk: boolean;
  fk: boolean;
  unique: boolean;
  nullable: boolean;
}

export interface NodeRow {
  id: string;
  project_id: string;
  label: string;
  sub: string;
  shape: Shape;
  accent: Accent;
  x: number;
  y: number;
  w: number | null;
  h: number | null;
  workspace: Workspace;
  columns: ErdColumnRow[] | null;
  table_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface EdgeRow {
  id: string;
  project_id: string;
  from_node: string;
  to_node: string;
  from_handle: HandleSegment | null;
  to_handle: HandleSegment | null;
  cardinality: Cardinality | null;
  from_column: string | null;
  to_column: string | null;
  created_at: string;
  updated_at: string;
}

// Application types
export interface Project {
  id: string;
  name: string;
  description: string | null;
  zoom: number;
  autoLayout: boolean;
  smartRoute: boolean;
  workspace: Workspace;
  schemaSource: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Node extends PositionedNode {
  id: string;
  label: string;
  sub: string;
  shape: Shape;
  accent: Accent;
  projectId: string;
  workspace: Workspace;
  columns: ErdColumnRow[] | null;
  tableName: string | null;
}

export interface Edge {
  id: string;
  projectId: string;
  from: string;
  to: string;
  fromHandle?: HandleSegment;
  toHandle?: HandleSegment;
  cardinality?: Cardinality;
  fromColumn?: string;
  toColumn?: string;
}

// Converters
function rowToProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    zoom: row.zoom,
    autoLayout: row.auto_layout,
    smartRoute: row.smart_route,
    workspace: row.workspace,
    schemaSource: row.schema_source,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function rowToNode(row: NodeRow): Node {
  return {
    id: row.id,
    projectId: row.project_id,
    label: row.label,
    sub: row.sub,
    shape: row.shape,
    accent: row.accent,
    x: row.x,
    y: row.y,
    w: row.w ?? undefined,
    h: row.h ?? undefined,
    workspace: row.workspace,
    columns: row.columns ?? null,
    tableName: row.table_name ?? null,
  };
}

function rowToEdge(row: EdgeRow): Edge {
  return {
    id: row.id,
    projectId: row.project_id,
    from: row.from_node,
    to: row.to_node,
    fromHandle: row.from_handle ?? undefined,
    toHandle: row.to_handle ?? undefined,
    cardinality: row.cardinality ?? undefined,
    fromColumn: row.from_column ?? undefined,
    toColumn: row.to_column ?? undefined,
  };
}

// Project operations

export async function listProjects(): Promise<Project[]> {
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).map(rowToProject);
}

export async function getProject(id: string): Promise<Project | null> {
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data ? rowToProject(data) : null;
}

export async function createProject(
  project: Omit<Project, "id" | "createdAt" | "updatedAt">
): Promise<Project> {
  const userId = await getUserId();
  const { data, error } = await supabase
    .from("projects")
    .insert({
      user_id: userId,
      name: project.name,
      description: project.description,
      zoom: project.zoom,
      auto_layout: project.autoLayout,
      smart_route: project.smartRoute,
      workspace: project.workspace,
      schema_source: project.schemaSource,
    })
    .select()
    .single();

  if (error) throw error;
  return rowToProject(data);
}

export async function updateProject(
  id: string,
  updates: Partial<Pick<Project, "name" | "description" | "zoom" | "autoLayout" | "smartRoute" | "workspace" | "schemaSource">>
): Promise<Project> {
  const updateData: Record<string, unknown> = {};

  if (updates.name !== undefined) updateData.name = updates.name;
  if (updates.description !== undefined) updateData.description = updates.description;
  if (updates.zoom !== undefined) updateData.zoom = updates.zoom;
  if (updates.autoLayout !== undefined) updateData.auto_layout = updates.autoLayout;
  if (updates.smartRoute !== undefined) updateData.smart_route = updates.smartRoute;
  if (updates.workspace !== undefined) updateData.workspace = updates.workspace;
  if (updates.schemaSource !== undefined) updateData.schema_source = updates.schemaSource;

  const { data, error } = await supabase
    .from("projects")
    .update(updateData)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return rowToProject(data);
}

export async function deleteProject(id: string): Promise<void> {
  const { error } = await supabase.from("projects").delete().eq("id", id);
  if (error) throw error;
}

// Node operations

export async function listNodes(projectId: string): Promise<Node[]> {
  const { data, error } = await supabase
    .from("nodes")
    .select("*")
    .eq("project_id", projectId);

  if (error) throw error;
  return (data ?? []).map(rowToNode);
}

export async function createNode(
  projectId: string,
  node: Omit<Node, "id" | "projectId">
): Promise<Node> {
  const userId = await getUserId();
  const { data, error } = await supabase
    .from("nodes")
    .insert({
      user_id: userId,
      project_id: projectId,
      label: node.label,
      sub: node.sub,
      shape: node.shape,
      accent: node.accent,
      x: node.x,
      y: node.y,
      w: node.w ?? null,
      h: node.h ?? null,
      workspace: node.workspace,
      columns: node.columns ?? null,
      table_name: node.tableName ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  return rowToNode(data);
}

export async function updateNode(
  id: string,
  updates: Partial<Pick<Node, "label" | "sub" | "shape" | "accent" | "x" | "y" | "w" | "h" | "workspace" | "columns" | "tableName">>
): Promise<Node> {
  const updateData: Record<string, unknown> = {};

  if (updates.label !== undefined) updateData.label = updates.label;
  if (updates.sub !== undefined) updateData.sub = updates.sub;
  if (updates.shape !== undefined) updateData.shape = updates.shape;
  if (updates.accent !== undefined) updateData.accent = updates.accent;
  if (updates.x !== undefined) updateData.x = updates.x;
  if (updates.y !== undefined) updateData.y = updates.y;
  if (updates.w !== undefined) updateData.w = updates.w;
  if (updates.h !== undefined) updateData.h = updates.h;
  if (updates.workspace !== undefined) updateData.workspace = updates.workspace;
  if (updates.columns !== undefined) updateData.columns = updates.columns;
  if (updates.tableName !== undefined) updateData.table_name = updates.tableName;

  const { data, error } = await supabase
    .from("nodes")
    .update(updateData)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return rowToNode(data);
}

export async function deleteNode(id: string): Promise<void> {
  const { error } = await supabase.from("nodes").delete().eq("id", id);
  if (error) throw error;
}

export async function batchCreateNodes(
  projectId: string,
  nodes: Omit<Node, "id" | "projectId">[]
): Promise<Node[]> {
  const userId = await getUserId();
  const { data, error } = await supabase
    .from("nodes")
    .insert(
      nodes.map((n) => ({
        user_id: userId,
        project_id: projectId,
        label: n.label,
        sub: n.sub,
        shape: n.shape,
        accent: n.accent,
        x: n.x,
        y: n.y,
        w: n.w ?? null,
        h: n.h ?? null,
        workspace: n.workspace,
        columns: n.columns ?? null,
        table_name: n.tableName ?? null,
      }))
    )
    .select();

  if (error) throw error;
  return (data ?? []).map(rowToNode);
}

// Edge operations

export async function listEdges(projectId: string): Promise<Edge[]> {
  const { data, error } = await supabase
    .from("edges")
    .select("*")
    .eq("project_id", projectId);

  if (error) throw error;
  return (data ?? []).map(rowToEdge);
}

export async function createEdge(
  projectId: string,
  edge: Omit<Edge, "id" | "projectId">
): Promise<Edge> {
  const userId = await getUserId();
  const { data, error } = await supabase
    .from("edges")
    .insert({
      user_id: userId,
      project_id: projectId,
      from_node: edge.from,
      to_node: edge.to,
      from_handle: edge.fromHandle ?? null,
      to_handle: edge.toHandle ?? null,
      cardinality: edge.cardinality ?? null,
      from_column: edge.fromColumn ?? null,
      to_column: edge.toColumn ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  return rowToEdge(data);
}

export async function updateEdge(
  id: string,
  updates: Partial<Pick<Edge, "from" | "to" | "fromHandle" | "toHandle">>
): Promise<Edge> {
  const updateData: Record<string, unknown> = {};

  if (updates.from !== undefined) updateData.from_node = updates.from;
  if (updates.to !== undefined) updateData.to_node = updates.to;
  if (updates.fromHandle !== undefined) updateData.from_handle = updates.fromHandle;
  if (updates.toHandle !== undefined) updateData.to_handle = updates.toHandle;

  const { data, error } = await supabase
    .from("edges")
    .update(updateData)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return rowToEdge(data);
}

export async function deleteEdge(id: string): Promise<void> {
  const { error } = await supabase.from("edges").delete().eq("id", id);
  if (error) throw error;
}

export async function batchCreateEdges(
  projectId: string,
  edges: Omit<Edge, "id" | "projectId">[]
): Promise<Edge[]> {
  const userId = await getUserId();
  const { data, error } = await supabase
    .from("edges")
    .insert(
      edges.map((e) => ({
        user_id: userId,
        project_id: projectId,
        from_node: e.from,
        to_node: e.to,
        from_handle: e.fromHandle ?? null,
        to_handle: e.toHandle ?? null,
        cardinality: e.cardinality ?? null,
        from_column: e.fromColumn ?? null,
        to_column: e.toColumn ?? null,
      }))
    )
    .select();

  if (error) throw error;
  return (data ?? []).map(rowToEdge);
}

// Full project load (nodes + edges)

export interface FullProject {
  project: Project;
  nodes: Node[];
  edges: Edge[];
}

export async function loadFullProject(projectId: string): Promise<FullProject | null> {
  const project = await getProject(projectId);
  if (!project) return null;

  const [nodes, edges] = await Promise.all([
    listNodes(projectId),
    listEdges(projectId),
  ]);

  return { project, nodes, edges };
}
