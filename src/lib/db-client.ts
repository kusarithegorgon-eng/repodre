/**
 * Database Client for Repodre
 *
 * Provides typed access to the Supabase database for
 * persisting projects, nodes, and edges.
 */

import { supabase } from "./supabase";
import type { Shape, HandleSegment, PositionedNode } from "./canvas-geometry";

// Database row types
export interface ProjectRow {
  id: string;
  name: string;
  description: string | null;
  zoom: number;
  auto_layout: boolean;
  smart_route: boolean;
  created_at: string;
  updated_at: string;
}

export interface NodeRow {
  id: string;
  project_id: string;
  label: string;
  sub: string;
  shape: Shape;
  accent: "green" | "purple" | "teal" | "blue";
  x: number;
  y: number;
  w: number | null;
  h: number | null;
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
  createdAt: Date;
  updatedAt: Date;
}

export interface Node extends PositionedNode {
  id: string;
  label: string;
  sub: string;
  shape: Shape;
  accent: "green" | "purple" | "teal" | "blue";
  projectId: string;
}

export interface Edge {
  id: string;
  projectId: string;
  from: string;
  to: string;
  fromHandle?: HandleSegment;
  toHandle?: HandleSegment;
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
  const { data, error } = await supabase
    .from("projects")
    .insert({
      name: project.name,
      description: project.description,
      zoom: project.zoom,
      auto_layout: project.autoLayout,
      smart_route: project.smartRoute,
    })
    .select()
    .single();

  if (error) throw error;
  return rowToProject(data);
}

export async function updateProject(
  id: string,
  updates: Partial<Pick<Project, "name" | "description" | "zoom" | "autoLayout" | "smartRoute">>
): Promise<Project> {
  const updateData: Record<string, unknown> = {};

  if (updates.name !== undefined) updateData.name = updates.name;
  if (updates.description !== undefined) updateData.description = updates.description;
  if (updates.zoom !== undefined) updateData.zoom = updates.zoom;
  if (updates.autoLayout !== undefined) updateData.auto_layout = updates.autoLayout;
  if (updates.smartRoute !== undefined) updateData.smart_route = updates.smartRoute;

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
  const { data, error } = await supabase
    .from("nodes")
    .insert({
      project_id: projectId,
      label: node.label,
      sub: node.sub,
      shape: node.shape,
      accent: node.accent,
      x: node.x,
      y: node.y,
      w: node.w ?? null,
      h: node.h ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  return rowToNode(data);
}

export async function updateNode(
  id: string,
  updates: Partial<Pick<Node, "label" | "sub" | "shape" | "accent" | "x" | "y" | "w" | "h">>
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
  const { data, error } = await supabase
    .from("nodes")
    .insert(
      nodes.map((n) => ({
        project_id: projectId,
        label: n.label,
        sub: n.sub,
        shape: n.shape,
        accent: n.accent,
        x: n.x,
        y: n.y,
        w: n.w ?? null,
        h: n.h ?? null,
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
  const { data, error } = await supabase
    .from("edges")
    .insert({
      project_id: projectId,
      from_node: edge.from,
      to_node: edge.to,
      from_handle: edge.fromHandle ?? null,
      to_handle: edge.toHandle ?? null,
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
  const { data, error } = await supabase
    .from("edges")
    .insert(
      edges.map((e) => ({
        project_id: projectId,
        from_node: e.from,
        to_node: e.to,
        from_handle: e.fromHandle ?? null,
        to_handle: e.toHandle ?? null,
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
