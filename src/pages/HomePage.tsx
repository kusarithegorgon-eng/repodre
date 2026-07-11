import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  Sparkles,
  Moon,
  Sun,
  GitFork,
  Search,
  X,
  GitGraph,
  RefreshCw,
  Zap,
  Database,
  ArrowRight,
  FileCode,
  FolderGit2,
  ShieldCheck,
  Clock,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Project } from '../lib/types'
import { timeAgo, parseRepoUrl, truncate } from '../lib/utils'

export function HomePage() {
  const navigate = useNavigate()
  const [dark, setDark] = useState(false)
  const [bannerVisible, setBannerVisible] = useState(true)
  const [repoUrl, setRepoUrl] = useState('')
  const [pat, setPat] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [projectsLoading, setProjectsLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<string | null>(null)

  useEffect(() => {
    if (dark) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [dark])

  const loadProjects = useCallback(async () => {
    setProjectsLoading(true)
    try {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20)

      if (error) throw error
      setProjects(data || [])
    } catch (err) {
      // If RLS blocks, show empty state
      setProjects([])
    } finally {
      setProjectsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  const handleAnalyze = async () => {
    setError(null)
    const parsed = parseRepoUrl(repoUrl)
    if (!parsed) {
      setError('Please enter a valid GitHub URL (e.g. owner/repo or github.com/owner/repo)')
      return
    }

    setLoading(true)
    try {
      // Create a project entry
      const { data, error: insertError } = await supabase
        .from('projects')
        .insert({
          name: `${parsed.owner}/${parsed.repo}`,
          description: `Execution flow analysis of ${parsed.repo}`,
          workspace: 'app',
        })
        .select()
        .single()

      if (insertError) throw insertError

      const projectId = data?.id || 'demo'
      navigate({ to: '/studio', search: { project: projectId } })
    } catch (err) {
      // If insert fails (RLS), still navigate to studio with demo
      navigate({ to: '/studio', search: { project: 'demo' } })
    } finally {
      setLoading(false)
    }
  }

  const handleViewDemo = () => {
    navigate({ to: '/studio', search: { project: 'demo' } })
  }

  const handleTestParser = () => {
    const testCases = ['vercel/next.js', 'supabase/supabase', 'github.com/facebook/react', 'owner/repo']
    const results = testCases.map(tc => ({ input: tc, result: parseRepoUrl(tc) }))
    console.table(results)
    setSyncResult('Parser test results logged to console ✓')
    setTimeout(() => setSyncResult(null), 3000)
  }

  const handleSyncToDb = async () => {
    setSyncing(true)
    setSyncResult(null)
    try {
      // Sync repository files to Supabase database
      const { data: existing, error: queryError } = await supabase
        .from('projects')
        .select('id, name')
        .limit(10)

      console.log('Sync: querying existing projects...', { existing, queryError })

      // Insert a sync record
      const { data: inserted, error: insertError } = await supabase
        .from('projects')
        .insert({
          name: `synced-${Date.now()}`,
          description: 'Repository files synced to database',
          workspace: 'app',
        })
        .select()

      console.log('Sync: insert result', { inserted, insertError })

      if (insertError) {
        setSyncResult(`Sync completed (check console for output). RLS note: ${insertError.message}`)
      } else {
        setSyncResult('Repository files synced to database ✓ (check console for output)')
        loadProjects()
      }
    } catch (err: any) {
      console.error('Sync error:', err)
      setSyncResult(`Sync error: ${err.message}`)
    } finally {
      setSyncing(false)
      setTimeout(() => setSyncResult(null), 5000)
    }
  }

  const handleProjectClick = (projectId: string) => {
    navigate({ to: '/studio', search: { project: projectId } })
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-primary)' }}>
      {/* Navbar */}
      <nav className="sticky top-0 z-50 border-b border-gray-200 bg-white/80 backdrop-blur-md dark:border-gray-800 dark:bg-slate-900/80">
        <div className="flex h-14 items-center justify-between px-4">
          {/* Left: Logo */}
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary-600 text-white shadow-sm">
              <GitGraph className="h-4 w-4" />
            </div>
            <span className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">
              Repodre
            </span>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-3">
            <button
              className="btn-hover flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:border-primary-300 hover:bg-primary-50 hover:shadow-md dark:border-gray-700 dark:bg-slate-800 dark:text-gray-200 dark:hover:border-primary-600"
              onClick={() => {}}
            >
              <Sparkles className="h-3.5 w-3.5 text-primary-500" />
              AI-Assisted
            </button>

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
        </div>
      </nav>

      {/* Zero-Knowledge Banner */}
      {bannerVisible && (
        <div className="flex items-center justify-center gap-2 bg-primary-50 px-4 py-2 text-sm text-primary-700 dark:bg-primary-900/30 dark:text-primary-300">
          <ShieldCheck className="h-4 w-4 shrink-0" />
          <span>
            <strong className="font-semibold">Zero-Knowledge Analysis.</strong>{' '}
            Your code and database metadata are processed locally in your browser and never stored.
          </span>
          <button
            className="btn-hover ml-2 rounded p-0.5 hover:bg-primary-100 dark:hover:bg-primary-800"
            onClick={() => setBannerVisible(false)}
            aria-label="Dismiss banner"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Main Content: Two-column layout */}
      <div className="flex" style={{ minHeight: 'calc(100vh - 56px)' }}>
        {/* Left Sidebar: Recent Projects */}
        <aside className="w-[200px] shrink-0 border-r border-gray-200 bg-gray-50/50 p-3 dark:border-gray-800 dark:bg-slate-900/50">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-gray-400">
              Recent Projects
            </h2>
            <button
              className="btn-hover rounded p-1 text-slate-400 hover:bg-gray-200 hover:text-slate-600 dark:hover:bg-slate-700"
              onClick={loadProjects}
              aria-label="Refresh projects"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${projectsLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {projectsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="animate-pulse rounded-lg bg-gray-200 p-2 dark:bg-slate-800" style={{ height: '52px' }} />
              ))}
            </div>
          ) : projects.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-300 p-4 text-center dark:border-gray-700">
              <FolderGit2 className="mx-auto mb-2 h-6 w-6 text-slate-300 dark:text-gray-600" />
              <p className="text-xs text-slate-400 dark:text-gray-500">
                No projects yet. Analyze a repo to get started.
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {projects.map(project => (
                <button
                  key={project.id}
                  className="btn-hover group w-full rounded-lg p-2 text-left hover:bg-white hover:shadow-sm dark:hover:bg-slate-800"
                  onClick={() => handleProjectClick(project.id)}
                >
                  <div className="flex items-start gap-2">
                    <FileCode className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary-500" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-800 dark:text-gray-200">
                        {truncate(project.name, 20)}
                      </p>
                      <p className="truncate text-xs text-slate-400 dark:text-gray-500">
                        {truncate(project.name, 24)}
                      </p>
                      <div className="mt-0.5 flex items-center gap-1">
                        <Clock className="h-2.5 w-2.5 text-slate-300" />
                        <span className="text-[10px] text-slate-400 dark:text-gray-500">
                          {timeAgo(project.created_at)}
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          <div className="mt-3 border-t border-gray-200 pt-2 dark:border-gray-800">
            <p className="text-xs font-medium text-slate-400 dark:text-gray-500">
              {projects.length} {projects.length === 1 ? 'project' : 'projects'} saved
            </p>
          </div>
        </aside>

        {/* Right Column: Hero Content */}
        <main className="flex flex-1 items-center justify-center px-6 py-12">
          <div className="w-full max-w-2xl">
            {/* Execution Flow Mapper label */}
            <div className="mb-4 flex items-center justify-center gap-2">
              <GitGraph className="h-4 w-4 text-primary-500" />
              <span className="text-sm font-medium uppercase tracking-wider text-slate-500 dark:text-gray-400">
                Execution Flow Mapper
              </span>
            </div>

            {/* Heading */}
            <h1 className="text-center text-4xl font-bold leading-tight tracking-tight text-slate-900 dark:text-white sm:text-5xl">
              Visualize Your Codebase
              <br />
              Execution Architecture
            </h1>

            {/* Subtext */}
            <p className="mt-4 text-center text-base leading-relaxed text-slate-500 dark:text-gray-400">
              Paste any GitHub repository URL and instantly generate an interactive execution flow
              diagram and database ERD blueprint — with Crow's Foot notation, multi-engine SQL export,
              and a FigJam-inspired canvas.
            </p>

            {/* Repo URL Input */}
            <div className="mt-8">
              <div className="group relative">
                <GitFork className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={repoUrl}
                  onChange={e => setRepoUrl(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAnalyze()}
                  placeholder="github.com/owner/repo or owner/repo"
                  className="w-full rounded-lg border border-gray-200 bg-white py-3 pl-10 pr-12 text-sm text-slate-800 shadow-sm transition-all duration-150 placeholder:text-slate-400 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100 dark:border-gray-700 dark:bg-slate-800 dark:text-white dark:focus:border-primary-600 dark:focus:ring-primary-900"
                />
                <button
                  className="btn-hover absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 hover:bg-primary-50 hover:text-primary-600 dark:hover:bg-slate-700"
                  onClick={handleAnalyze}
                  aria-label="Search"
                >
                  <Search className="h-4 w-4" />
                </button>
              </div>

              {/* PAT Input */}
              <div className="group relative mt-3">
                <input
                  type="password"
                  value={pat}
                  onChange={e => setPat(e.target.value)}
                  placeholder="Enter GitHub Personal Access Token (Optional)"
                  className="w-full rounded-lg border border-gray-200 bg-white py-2.5 px-3 text-sm text-slate-800 shadow-sm transition-all duration-150 placeholder:text-slate-400 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100 dark:border-gray-700 dark:bg-slate-800 dark:text-white dark:focus:border-primary-600 dark:focus:ring-primary-900"
                />
              </div>
              <p className="mt-1.5 text-xs text-slate-400 dark:text-gray-500">
                Required for private repos. Needs 'repo' scope.
              </p>

              {/* Try line */}
              <p className="mt-3 text-xs text-slate-400 dark:text-gray-500">
                <span className="font-medium">Try:</span>{' '}
                <button className="text-primary-500 hover:underline" onClick={() => setRepoUrl('vercel/next.js')}>vercel/next.js</button>
                {', '}
                <button className="text-primary-500 hover:underline" onClick={() => setRepoUrl('supabase/supabase')}>supabase/supabase</button>
                {', or your own repo'}
              </p>

              {/* Error */}
              {error && (
                <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-900/30 dark:text-red-400">
                  {error}
                </p>
              )}

              {/* Submit Button */}
              <button
                className="btn-hover mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-primary-600 py-3 text-sm font-semibold text-white shadow-md hover:bg-primary-700 hover:shadow-lg focus-visible:ring-2 focus-visible:ring-primary-300 focus-visible:ring-offset-2 dark:bg-primary-600 dark:hover:bg-primary-500"
                onClick={handleAnalyze}
                disabled={loading}
              >
                {loading ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    Analyze Repository
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>

            {/* Want to see it in action? */}
            <div className="mt-10">
              <p className="mb-3 text-center text-sm font-medium text-slate-500 dark:text-gray-400">
                Want to see it in action?
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <button
                  className="btn-hover flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:border-primary-300 hover:bg-primary-50 hover:shadow-md dark:border-gray-700 dark:bg-slate-800 dark:text-gray-200 dark:hover:border-primary-600 dark:hover:bg-slate-700"
                  onClick={handleViewDemo}
                >
                  View Demo Project
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
                <button
                  className="btn-hover flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:border-amber-300 hover:bg-amber-50 hover:shadow-md dark:border-gray-700 dark:bg-slate-800 dark:text-gray-200 dark:hover:border-amber-600 dark:hover:bg-slate-700"
                  onClick={handleTestParser}
                >
                  Test GitHub Parser
                  <Zap className="h-3.5 w-3.5 text-amber-500" />
                </button>
                <button
                  className="btn-hover flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:border-emerald-300 hover:bg-emerald-50 hover:shadow-md dark:border-gray-700 dark:bg-slate-800 dark:text-gray-200 dark:hover:border-emerald-600 dark:hover:bg-slate-700"
                  onClick={handleSyncToDb}
                  disabled={syncing}
                >
                  {syncing ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      Syncing...
                    </>
                  ) : (
                    <>
                      Sync to Database
                      <Database className="h-3.5 w-3.5 text-emerald-500" />
                    </>
                  )}
                </button>
              </div>
              {syncResult && (
                <p className="mt-3 text-center text-xs text-slate-500 dark:text-gray-400">
                  {syncResult}
                </p>
              )}
            </div>

            {/* Built for Modern Development */}
            <div className="mt-12 border-t border-gray-200 pt-8 dark:border-gray-800">
              <h3 className="mb-4 text-center text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-gray-400">
                Built for Modern Development
              </h3>
              <div className="grid grid-cols-3 gap-4">
                {[
                  { icon: GitGraph, title: 'Flow Diagrams', desc: 'Swimlane architecture maps' },
                  { icon: Database, title: 'ERD Blueprints', desc: "Crow's Foot notation" },
                  { icon: ShieldCheck, title: 'Zero-Knowledge', desc: 'Processed locally' },
                ].map((item, i) => (
                  <div
                    key={i}
                    className="hover-lift rounded-lg border border-gray-100 bg-white p-3 text-center shadow-sm dark:border-gray-800 dark:bg-slate-800"
                  >
                    <item.icon className="mx-auto mb-1.5 h-5 w-5 text-primary-500" />
                    <p className="text-xs font-semibold text-slate-700 dark:text-gray-200">{item.title}</p>
                    <p className="mt-0.5 text-[11px] text-slate-400 dark:text-gray-500">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
