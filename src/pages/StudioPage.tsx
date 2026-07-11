import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { Home, GitBranch, Layers, Search, Settings, Clock, ChevronRight, ChevronDown, Folder, FileCode, GitGraph, Moon, Sun, TriangleAlert as AlertTriangle, ArrowRight, CircleDot, Play, LogOut, RefreshCw, Filter, Database, Shield, Cpu, Zap, Eye, CircleCheck as CheckCircle, Circle as XCircle, Server } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Project, FileTreeNode, SwimlaneDef, FlowNodeDef } from '../lib/types'
import { truncate } from '../lib/utils'

// Swimlane definitions
const SWIMLANES: SwimlaneDef[] = [
  { id: 'entry', name: 'Entry & Exit', bgClass: 'bg-green-50', headerColor: 'text-green-700', dotColor: 'bg-green-500' },
  { id: 'auth', name: 'Auth & Middleware', bgClass: 'bg-amber-50', headerColor: 'text-amber-700', dotColor: 'bg-amber-500' },
  { id: 'core', name: 'Core Logic', bgClass: 'bg-cyan-50', headerColor: 'text-cyan-700', dotColor: 'bg-cyan-500' },
  { id: 'background', name: 'Background Services', bgClass: 'bg-purple-50', headerColor: 'text-purple-700', dotColor: 'bg-purple-500' },
  { id: 'data', name: 'Data Layer', bgClass: 'bg-blue-50', headerColor: 'text-blue-700', dotColor: 'bg-blue-500' },
  { id: 'error', name: 'Error Handling', bgClass: 'bg-red-50', headerColor: 'text-red-700', dotColor: 'bg-red-500' },
]

// Mock file tree
const FILE_TREE: FileTreeNode[] = [
  {
    name: 'app',
    type: 'folder',
    path: 'app',
    children: [
      { name: 'page.tsx', type: 'file', path: 'app/page.tsx' },
      { name: 'layout.tsx', type: 'file', path: 'app/layout.tsx' },
      { name: 'globals.css', type: 'file', path: 'app/globals.css' },
      {
        name: 'api',
        type: 'folder',
        path: 'app/api',
        children: [
          { name: 'route.ts', type: 'file', path: 'app/api/route.ts' },
          { name: 'auth', type: 'folder', path: 'app/api/auth', children: [
            { name: 'callback.ts', type: 'file', path: 'app/api/auth/callback.ts' },
          ]},
        ],
      },
    ],
  },
  {
    name: 'DAW',
    type: 'folder',
    path: 'DAW',
    children: [
      { name: 'processor.ts', type: 'file', path: 'DAW/processor.ts' },
      { name: 'mixer.ts', type: 'file', path: 'DAW/mixer.ts' },
    ],
  },
  {
    name: 'Terms',
    type: 'folder',
    path: 'Terms',
    children: [
      { name: 'service.tsx', type: 'file', path: 'Terms/service.tsx' },
      { name: 'privacy.tsx', type: 'file', path: 'Terms/privacy.tsx' },
    ],
  },
  { name: 'page.tsx', type: 'file', path: 'page.tsx' },
  { name: 'layout.tsx', type: 'file', path: 'layout.tsx' },
  { name: 'package.json', type: 'file', path: 'package.json' },
]

// Flow nodes per lane
const FLOW_NODES: FlowNodeDef[] = [
  // Entry & Exit lane
  { id: 'n1', type: 'regular', label: 'START', sub: 'Start', lane: 'entry', x: 0, y: 0 },
  { id: 'n2', type: 'regular', label: 'PAGE', sub: 'Landing Page', lane: 'entry', x: 0, y: 1 },
  { id: 'n3', type: 'regular', label: 'PAGE', sub: 'Form', lane: 'entry', x: 0, y: 2 },
  { id: 'n4', type: 'regular', label: 'LOGOUT', sub: 'Logout', lane: 'entry', x: 0, y: 3 },
  { id: 'n5', type: 'regular', label: 'PAGE', sub: 'PAGE', lane: 'entry', x: 0, y: 4 },
  { id: 'n6', type: 'regular', label: 'LOOP', sub: 'LOOP', lane: 'entry', x: 0, y: 5 },

  // Auth & Middleware lane
  { id: 'a1', type: 'regular', label: 'MIDDLEWARE', sub: 'Auth Check', lane: 'auth', x: 1, y: 0 },
  { id: 'a2', type: 'regular', label: 'SESSION', sub: 'Validate Token', lane: 'auth', x: 1, y: 1 },
  { id: 'a3', type: 'decision', label: 'Y', sub: 'N', lane: 'auth', x: 1, y: 2 },
  { id: 'a4', type: 'regular', label: 'GUARD', sub: 'Route Guard', lane: 'auth', x: 1, y: 3 },

  // Core Logic lane
  { id: 'c1', type: 'antipattern', label: 'Anti-Pattern: View-to-DB Bypass Detected', lane: 'core', x: 2, y: 0, badges: [{ text: 'LOGIC', color: 'blue' }, { text: 'M+1', color: 'green' }] },
  { id: 'c2', type: 'regular', label: 'CONTROLLER', sub: 'Form Handler', lane: 'core', x: 2, y: 1 },
  { id: 'c3', type: 'regular', label: 'SERVICE', sub: 'Business Logic', lane: 'core', x: 2, y: 2 },
  { id: 'c4', type: 'decision', label: 'Y', sub: 'N', lane: 'core', x: 2, y: 3 },
  { id: 'c5', type: 'regular', label: 'VALIDATE', sub: 'Input Check', lane: 'core', x: 2, y: 4 },

  // Background Services lane
  { id: 'b1', type: 'regular', label: 'CRON', sub: 'Scheduled Task', lane: 'background', x: 3, y: 0 },
  { id: 'b2', type: 'regular', label: 'QUEUE', sub: 'Job Processor', lane: 'background', x: 3, y: 1 },
  { id: 'b3', type: 'arrow', label: '→', lane: 'background', x: 3, y: 2 },
  { id: 'b4', type: 'regular', label: 'WORKER', sub: 'Background Job', lane: 'background', x: 3, y: 3 },

  // Data Layer lane
  { id: 'd1', type: 'regular', label: 'QUERY', sub: 'SQL Builder', lane: 'data', x: 4, y: 0 },
  { id: 'd2', type: 'regular', label: 'ORM', sub: 'Prisma Client', lane: 'data', x: 4, y: 1 },
  { id: 'd3', type: 'regular', label: 'DB', sub: 'PostgreSQL', lane: 'data', x: 4, y: 2 },
  { id: 'd4', type: 'regular', label: 'CACHE', sub: 'Redis Layer', lane: 'data', x: 4, y: 3 },

  // Error Handling lane
  { id: 'e1', type: 'regular', label: 'TRY/CATCH', sub: 'Error Boundary', lane: 'error', x: 5, y: 0 },
  { id: 'e2', type: 'regular', label: 'LOG', sub: 'Error Logger', lane: 'error', x: 5, y: 1 },
  { id: 'e3', type: 'regular', label: 'RECOVER', sub: 'Fallback UI', lane: 'error', x: 5, y: 2 },
  { id: 'e4', type: 'regular', label: 'ALERT', sub: 'Notify Admin', lane: 'error', x: 5, y: 3 },
]

// Node type filters
const NODE_FILTERS = ['View', 'Validation', 'Controller', 'Database', 'I/O', 'Error']

// Icon sidebar items
const SIDEBAR_ICONS = [
  { icon: Home, name: 'Home' },
  { icon: GitBranch, name: 'Branches' },
  { icon: Layers, name: 'Layers' },
  { icon: Search, name: 'Search' },
  { icon: Database, name: 'Database' },
  { icon: Filter, name: 'Filter' },
  { icon: Settings, name: 'Settings' },
]

export function StudioPage() {
  const navigate = useNavigate()
  const search = useSearch({ strict: false }) as { project?: string }
  const projectId = search.project || 'demo'

  const [dark, setDark] = useState(false)
  const [project, setProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['app', 'app/api']))
  const [activeFilter, setActiveFilter] = useState<string | null>(null)
  const [activeSidebarIcon, setActiveSidebarIcon] = useState('Layers')
  const [hoveredIcon, setHoveredIcon] = useState<string | null>(null)

  // Canvas panning state
  const canvasRef = useRef<HTMLDivElement>(null)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 })

  // Fix the document title
  useEffect(() => {
    document.title = 'Repodre'
  }, [])

  useEffect(() => {
    if (dark) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [dark])

  // Load project data
  const loadProject = useCallback(async () => {
    setLoading(true)
    if (projectId === 'demo') {
      setProject({
        id: 'demo',
        name: 'demo-project/repodre-demo',
        description: 'Demo execution flow project',
        schema_source: null,
        workspace: 'app',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      setLoading(false)
      return
    }

    try {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .maybeSingle()

      if (error) throw error
      setProject(data || null)
    } catch {
      setProject(null)
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    loadProject()
  }, [loadProject])

  // Canvas panning handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return
    setIsPanning(true)
    panStart.current = {
      x: e.clientX,
      y: e.clientY,
      panX: pan.x,
      panY: pan.y,
    }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isPanning) return
    const dx = e.clientX - panStart.current.x
    const dy = e.clientY - panStart.current.y
    setPan({ x: panStart.current.panX + dx, y: panStart.current.panY + dy })
  }

  const handleMouseUp = () => {
    setIsPanning(false)
  }

  const toggleFolder = (path: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }

  const renderFileTree = (nodes: FileTreeNode[], depth: number = 0): React.ReactNode => {
    return nodes.map(node => {
      const isExpanded = expandedFolders.has(node.path)
      const paddingLeft = `${depth * 12 + 8}px`

      if (node.type === 'folder') {
        return (
          <div key={node.path}>
            <button
              className="btn-hover flex w-full items-center gap-1 py-1 text-left text-xs text-slate-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-slate-800"
              style={{ paddingLeft }}
              onClick={() => toggleFolder(node.path)}
            >
              {isExpanded ? (
                <ChevronDown className="h-3 w-3 shrink-0 text-slate-400" />
              ) : (
                <ChevronRight className="h-3 w-3 shrink-0 text-slate-400" />
              )}
              <Folder className="h-3.5 w-3.5 shrink-0 text-primary-500" />
              <span className="truncate font-medium">{node.name}</span>
            </button>
            {isExpanded && node.children && (
              <div>{renderFileTree(node.children, depth + 1)}</div>
            )}
          </div>
        )
      }

      return (
        <div
          key={node.path}
          className="flex items-center gap-1 py-1 text-xs text-slate-500 dark:text-gray-400"
          style={{ paddingLeft }}
        >
          <span className="w-3" />
          <FileCode className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span className="truncate">{node.name}</span>
        </div>
      )
    })
  }

  const renderNode = (node: FlowNodeDef) => {
    if (node.type === 'antipattern') {
      return (
        <div
          key={node.id}
          className="rounded-md bg-red-500 px-3 py-1.5 text-xs font-medium text-white shadow-sm flex items-center gap-1.5 max-w-[180px]"
        >
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{node.label}</span>
          {node.badges?.map((b, i) => (
            <span
              key={i}
              className={`ml-1 rounded px-1 py-0.5 text-[9px] font-bold ${
                b.color === 'blue' ? 'bg-blue-600' : 'bg-green-600'
              }`}
            >
              {b.text}
            </span>
          ))}
        </div>
      )
    }

    if (node.type === 'decision') {
      return (
        <div key={node.id} className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-slate-900 text-white text-xs flex items-center justify-center font-bold shadow-md">
            ?
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-semibold text-green-600">YES →</span>
            <span className="text-[10px] font-semibold text-red-500">NO ↓</span>
          </div>
        </div>
      )
    }

    if (node.type === 'arrow') {
      return (
        <div key={node.id} className="flex items-center justify-center">
          <div
            className="w-0 h-0"
            style={{
              borderTop: '6px solid transparent',
              borderBottom: '6px solid transparent',
              borderLeft: '10px solid #64748b',
            }}
          />
        </div>
      )
    }

    // Regular node
    return (
      <div
        key={node.id}
        className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-sm hover:shadow-md transition-shadow duration-150 dark:border-gray-700 dark:bg-slate-800 min-w-[100px]"
      style={{ width: 'fit-content' }}
      >
        <div className="flex items-center gap-1.5">
          <CircleDot className="h-2.5 w-2.5 text-primary-500" />
          <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-gray-500">
            {node.label}
          </span>
        </div>
        {node.sub && (
          <p className="mt-0.5 text-xs font-medium text-slate-700 dark:text-gray-200">
            {node.sub}
          </p>
        )}
      </div>
    )
  }

  const totalNodes = FLOW_NODES.length
  const totalEdges = 66

  return (
    <div className="flex h-screen flex-col overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
      {/* Top Navbar */}
      <nav className="flex h-14 shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4 dark:border-gray-800 dark:bg-slate-900">
        {/* Left: Time-Travel + Logo */}
        <div className="flex items-center gap-3">
          <button
            className="btn-hover flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:border-primary-300 hover:bg-primary-50 hover:shadow-md dark:border-gray-700 dark:bg-slate-800 dark:text-gray-200 dark:hover:border-primary-600 dark:hover:bg-slate-700"
            onClick={() => {}}
          >
            <Clock className="h-3.5 w-3.5 text-primary-500" />
            Time-Travel
          </button>
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary-600 text-white shadow-sm">
              <GitGraph className="h-3.5 w-3.5" />
            </div>
            <span className="text-sm font-bold text-slate-900 dark:text-white">Repodre</span>
          </div>
        </div>

        {/* Center: Project name */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-600 dark:text-gray-300">
            {loading ? 'Loading...' : project ? truncate(project.name, 30) : 'Unknown Project'}
          </span>
        </div>

        {/* Right: Dark mode + Avatar */}
        <div className="flex items-center gap-3">
          <button
            className="btn-hover flex h-8 w-8 items-center justify-center rounded-full text-slate-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-slate-800"
            onClick={() => setDark(!dark)}
            aria-label="Toggle dark mode"
          >
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-primary-500 to-primary-700 text-xs font-semibold text-white shadow-sm">
            KA
          </div>
        </div>
      </nav>

      {/* Body: Icon sidebar + Tree + Canvas */}
      <div className="flex flex-1 overflow-hidden">
        {/* Icon Sidebar */}
        <aside className="flex w-10 shrink-0 flex-col items-center gap-1 border-r border-gray-200 bg-white py-2 dark:border-gray-800 dark:bg-slate-900">
          {SIDEBAR_ICONS.map((item, i) => (
            <div
              key={i}
              className="relative"
              onMouseEnter={() => setHoveredIcon(item.name)}
              onMouseLeave={() => setHoveredIcon(null)}
            >
              <button
                className={`btn-hover flex h-8 w-8 items-center justify-center rounded-md transition-all duration-150 ${
                  activeSidebarIcon === item.name
                    ? 'bg-primary-100 text-primary-600 dark:bg-primary-900 dark:text-primary-400'
                    : 'text-slate-500 hover:bg-gray-100 hover:text-slate-700 dark:text-gray-400 dark:hover:bg-slate-800 dark:hover:text-gray-200'
                }`}
                onClick={() => {
                  setActiveSidebarIcon(item.name)
                  if (item.name === 'Home') navigate({ to: '/' })
                }}
                aria-label={item.name}
              >
                <item.icon className="h-4 w-4" />
              </button>
              {/* Tooltip */}
              {hoveredIcon === item.name && (
                <div className="absolute left-10 top-0 z-50 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-xs text-white shadow-lg dark:bg-slate-700">
                  {item.name}
                </div>
              )}
            </div>
          ))}
        </aside>

        {/* Project Tree Panel */}
        <aside className="w-[200px] shrink-0 overflow-y-auto border-r border-gray-200 bg-gray-50/50 p-2 dark:border-gray-800 dark:bg-slate-900/50">
          <div className="mb-2 flex items-center gap-1.5 px-1">
            <GitBranch className="h-3.5 w-3.5 text-primary-500" />
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-gray-400">
              Project Tree
            </h2>
          </div>
          <div className="mt-1">
            {renderFileTree(FILE_TREE, 0)}
          </div>
        </aside>

        {/* Canvas Area */}
        <div className="relative flex-1 overflow-hidden">
          {/* Swimlane Canvas */}
          <div
            ref={canvasRef}
            className="absolute inset-0 overflow-auto"
            style={{
              cursor: isPanning ? 'grabbing' : 'grab',
              background: 'var(--bg-primary)',
            }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            {/* Pannable content */}
            <div
              className="flex min-w-max"
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px)`,
                gap: '0',
              }}
            >
              {SWIMLANES.map(lane => {
                const laneNodes = FLOW_NODES.filter(n => n.lane === lane.id)
                return (
                  <div
                    key={lane.id}
                    className={`flex w-[200px] shrink-0 flex-col ${lane.bgClass} dark:bg-opacity-5`}
                    style={{ minHeight: '100%' }}
                  >
                    {/* Lane Header */}
                    <div className="sticky top-0 z-10 flex items-center gap-1.5 border-b border-gray-200 bg-white/80 px-3 py-2 backdrop-blur-sm dark:border-gray-700 dark:bg-slate-800/80">
                      <span className={`h-2 w-2 rounded-full ${lane.dotColor}`} />
                      <span className={`text-[10px] font-bold uppercase tracking-wide ${lane.headerColor}`}>
                        {lane.name}
                      </span>
                    </div>

                    {/* Lane Nodes */}
                    <div className="flex flex-col gap-3 p-3">
                      {laneNodes.map(node => (
                        <div key={node.id} className="flex items-center gap-2">
                          {renderNode(node)}
                        </div>
                      ))}

                      {/* Connector lines (visual) */}
                      {laneNodes.length > 1 && (
                        <div className="absolute" style={{ left: '100px' }}>
                          <svg className="pointer-events-none" width="2" height={laneNodes.length * 70}>
                            <line
                              x1="1" y1="0" x2="1" y2="100%"
                              stroke="#cbd5e1"
                              strokeWidth="1"
                              strokeDasharray="4 4"
                            />
                          </svg>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Bottom filter bar */}
          <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between border-t border-gray-200 bg-white/90 px-4 py-2 backdrop-blur-md dark:border-gray-800 dark:bg-slate-900/90">
            {/* Left: Node/edge count */}
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-gray-400">
              <span className="font-medium">{totalNodes} nodes</span>
              <span>•</span>
              <span className="font-medium">{totalEdges} edges</span>
            </div>

            {/* Center: Filter tabs */}
            <div className="flex items-center gap-1">
              {NODE_FILTERS.map(filter => (
                <button
                  key={filter}
                  className={`btn-hover rounded-md px-3 py-1 text-xs font-medium transition-all duration-150 ${
                    activeFilter === filter
                      ? 'bg-primary-600 text-white shadow-sm'
                      : 'text-slate-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-slate-800'
                  }`}
                  onClick={() => setActiveFilter(activeFilter === filter ? null : filter)}
                >
                  {filter}
                </button>
              ))}
            </div>

            {/* Right: Zoom indicator */}
            <div className="flex items-center gap-2 text-xs text-slate-400 dark:text-gray-500">
              <button className="btn-hover rounded p-1 hover:bg-gray-100 dark:hover:bg-slate-800" onClick={() => setPan({ x: 0, y: 0 })}>
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
              <span>100%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
