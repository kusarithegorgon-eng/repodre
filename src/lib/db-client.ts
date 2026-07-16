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

export interface AnnotationRow {
  id: string;
  project_id: string;
  node_id: string;
  author_id: string | null;
  author_name: string;
  body: { type: string; value: string; format: string };
  target: { type: string; id: string; selector: { type: string; value: string } };
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

export interface Annotation {
  id: string;
  projectId: string;
  nodeId: string;
  authorId: string | null;
  authorName: string;
  body: {
    type: "TextualBody";
    value: string;
    format: "text/plain";
  };
  target: {
    type: "CanvasNode";
    id: string;
    selector: {
      type: "NodeIdSelector";
      value: string;
    };
  };
  createdAt: Date;
  updatedAt: Date;
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

function rowToAnnotation(row: AnnotationRow): Annotation {
  return {
    id: row.id,
    projectId: row.project_id,
    nodeId: row.node_id,
    authorId: row.author_id,
    authorName: row.author_name,
    body: {
      type: row.body.type,
      value: row.body.value,
      format: row.body.format,
    },
    target: {
      type: row.target.type,
      id: row.target.id,
      selector: {
        type: row.target.selector.type,
        value: row.target.selector.value,
      },
    },
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
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
        workspace: n.workspace,
        columns: n.columns ?? null,
        table_name: n.tableName ?? null,
      }))
    )
    .select();

  if (error) throw error;
  return (data ?? []).map(rowToNode);
}

/**
 * Batch update node positions for the Reset to Auto-Layout feature.
 * Updates x and y coordinates for multiple nodes in a single batch.
 */
export async function batchUpdateNodePositions(
  updates: Array<{ id: string; x: number; y: number }>
): Promise<void> {
  if (updates.length === 0) return;

  // Update each node individually (Supabase doesn't support bulk update with different values)
  // Using Promise.all for parallel execution
  await Promise.all(
    updates.map(({ id, x, y }) =>
      supabase
        .from("nodes")
        .update({ x, y, updated_at: new Date().toISOString() })
        .eq("id", id)
    )
  );
}

/**
 * Sync repository files to Supabase as nodes.
 * Uses upsert to prevent duplicates based on (project_id, label).
 * Files are mapped to nodes with inferred shapes and positions.
 */
export async function syncRepoToSupabase(
  projectId: string,
  files: Array<{ id: string; name: string }>
): Promise<{ success: boolean; count: number; error?: string }> {
  if (!files.length) {
    return { success: true, count: 0 };
  }

  // Map files to node format
  const nodes = files.map((file, index) => ({
    label: file.name,
    sub: inferSubLabel(file.id),
    shape: inferShape(file.id) as Shape,
    accent: "teal" as Accent,
    x: 80 + (index % 6) * 200,
    y: 80 + Math.floor(index / 6) * 140,
    workspace: "app" as Workspace,
    columns: null,
    tableName: null,
  }));

  try {
    const { data, error } = await supabase
      .from("nodes")
      .upsert(
        nodes.map((n) => ({
          project_id: projectId,
          label: n.label,
          sub: n.sub,
          shape: n.shape,
          accent: n.accent,
          x: n.x,
          y: n.y,
          w: null,
          h: null,
          workspace: n.workspace,
          columns: null,
          table_name: null,
        })),
        {
          onConflict: "project_id,label",
          ignoreDuplicates: false,
        }
      )
      .select();

    if (error) {
      console.error("Supabase upsert error:", error);
      return { success: false, count: 0, error: error.message };
    }

    console.log(`Successfully synced ${data?.length ?? 0} nodes to database`);
    return { success: true, count: data?.length ?? 0 };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("syncRepoToSupabase error:", message);
    return { success: false, count: 0, error: message };
  }
}

function inferSubLabel(path: string): string {
  if (path.includes("/api/") || path.includes("/routes/")) return "Endpoint · Route";
  if (path.includes("component") || path.includes("Component")) return "UI · Component";
  if (path.includes("hook") || path.includes("use")) return "Hook · Logic";
  if (path.includes("util") || path.includes("lib")) return "Utility · Helper";
  if (path.includes("test") || path.includes(".spec.")) return "Test · Coverage";
  if (path.endsWith(".css") || path.endsWith(".scss")) return "Style · CSS";
  if (path.endsWith(".md")) return "Docs · Markdown";
  return "File · Source";
}

function inferShape(path: string): string {
  if (path.includes("/api/") || path.includes("/routes/")) return "rectangle";
  if (path.includes("component") || path.includes("Component")) return "pill";
  if (path.includes("hook") || path.includes("use")) return "hexagon";
  if (path.includes("util") || path.includes("lib")) return "parallelogram";
  if (path.includes("test") || path.includes(".spec.")) return "diamond";
  if (path.endsWith(".css") || path.endsWith(".scss")) return "document";
  return "rectangle";
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

export async function listAnnotations(projectId: string): Promise<Annotation[]> {
  const { data, error } = await supabase
    .from("annotations")
    .select("*")
    .eq("project_id", projectId);

  if (error) throw error;
  return (data ?? []).map(rowToAnnotation);
}

export async function createAnnotation(
  projectId: string,
  annotation: Omit<Annotation, "id" | "projectId" | "createdAt" | "updatedAt">
): Promise<Annotation> {
  const { data, error } = await supabase
    .from("annotations")
    .insert({
      project_id: projectId,
      node_id: annotation.nodeId,
      author_id: annotation.authorId,
      author_name: annotation.authorName,
      body: annotation.body,
      target: annotation.target,
    })
    .select()
    .single();

  if (error) throw error;
  return rowToAnnotation(data);
}

export async function deleteAnnotation(id: string): Promise<void> {
  const { error } = await supabase.from("annotations").delete().eq("id", id);
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

/**
 * Loads graph data (nodes + edges) from the database for a given project.
 * Returns normalized arrays ready to drop into canvas state.
 */
export async function loadGraphFromDatabase(
  projectId: string
): Promise<{
  nodes: Node[];
  edges: Edge[];
  project: Project | null;
} | null> {
  try {
    const full = await loadFullProject(projectId);
    if (!full) return null;
    return {
      project: full.project,
      nodes: full.nodes,
      edges: full.edges,
    };
  } catch (err) {
    console.error("loadGraphFromDatabase error:", err);
    return null;
  }
}

// ─── Collaboration: invitations & members ──────────────────────────────────

export type ProjectRole = "ADMIN" | "EDITOR" | "VIEWER";

export interface ProjectMember {
  id: string;
  projectId: string;
  userId: string;
  email: string;
  role: ProjectRole;
  createdAt: string;
}

export interface ProjectInvitation {
  id: string;
  projectId: string;
  email: string;
  role: ProjectRole;
  status: "pending" | "accepted" | "revoked";
  createdAt: string;
  acceptedAt: string | null;
}

function rowToMember(row: Record<string, unknown>): ProjectMember {
  return {
    id: row.id as string,
    projectId: row.project_id as string,
    userId: row.user_id as string,
    email: row.email as string,
    role: row.role as ProjectRole,
    createdAt: row.created_at as string,
  };
}

function rowToInvitation(row: Record<string, unknown>): ProjectInvitation {
  return {
    id: row.id as string,
    projectId: row.project_id as string,
    email: row.email as string,
    role: row.role as ProjectRole,
    status: row.status as "pending" | "accepted" | "revoked",
    createdAt: row.created_at as string,
    acceptedAt: (row.accepted_at as string) ?? null,
  };
}

export async function listMembers(projectId: string): Promise<ProjectMember[]> {
  const { data, error } = await supabase
    .from("project_members")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(rowToMember);
}

export async function listInvitations(projectId: string): Promise<ProjectInvitation[]> {
  const { data, error } = await supabase
    .from("project_invitations")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(rowToInvitation);
}

export async function inviteCollaborator(
  projectId: string,
  email: string,
  role: ProjectRole,
): Promise<ProjectInvitation> {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("project_invitations")
    .insert({
      project_id: projectId,
      email: email.toLowerCase().trim(),
      role,
      invited_by: user?.id ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return rowToInvitation(data);
}

export async function revokeInvitation(invitationId: string): Promise<void> {
  const { error } = await supabase
    .from("project_invitations")
    .update({ status: "revoked" })
    .eq("id", invitationId);
  if (error) throw error;
}

export async function updateMemberRole(
  memberId: string,
  role: ProjectRole,
): Promise<void> {
  const { error } = await supabase
    .from("project_members")
    .update({ role })
    .eq("id", memberId);
  if (error) throw error;
}

export async function removeMember(memberId: string): Promise<void> {
  const { error } = await supabase
    .from("project_members")
    .delete()
    .eq("id", memberId);
  if (error) throw error;
}

export async function acceptInvitation(invitationId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Must be signed in to accept invitation");

  const { data: invite, error: fetchErr } = await supabase
    .from("project_invitations")
    .select("*")
    .eq("id", invitationId)
    .single();
  if (fetchErr || !invite) throw new Error("Invitation not found");
  if (invite.status !== "pending") throw new Error("Invitation is no longer pending");
  if (invite.email !== user.email) throw new Error("This invitation is for a different email");

  const { error: memberErr } = await supabase
    .from("project_members")
    .insert({
      project_id: invite.project_id,
      user_id: user.id,
      email: user.email ?? "",
      role: invite.role,
    });
  if (memberErr) throw memberErr;

  await supabase
    .from("project_invitations")
    .update({ status: "accepted", accepted_at: new Date().toISOString() })
    .eq("id", invitationId);
}
