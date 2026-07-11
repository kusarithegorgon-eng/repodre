export interface Project {
  id: string
  name: string
  description: string | null
  schema_source: string | null
  workspace: string
  created_at: string
  updated_at: string
}

export interface ProjectWithMeta extends Project {
  repo_handle?: string
  time_ago?: string
}

export interface CanvasNode {
  id: string
  project_id: string
  label: string
  sub: string
  shape: string
  accent: string
  x: number
  y: number
  w: number | null
  h: number | null
  workspace: string
  table_name: string | null
  columns: any | null
}

export interface CanvasEdge {
  id: string
  project_id: string
  from_node: string
  to_node: string
  from_handle: string | null
  to_handle: string | null
  cardinality: string | null
  from_column: string | null
  to_column: string | null
}

export interface FileTreeNode {
  name: string
  type: 'folder' | 'file'
  children?: FileTreeNode[]
  path: string
}

export interface SwimlaneDef {
  id: string
  name: string
  bgClass: string
  headerColor: string
  dotColor: string
}

export interface FlowNodeDef {
  id: string
  type: 'regular' | 'antipattern' | 'decision' | 'arrow' | 'badge'
  label: string
  sub?: string
  badges?: { text: string; color: string }[]
  lane: string
  x: number
  y: number
}
