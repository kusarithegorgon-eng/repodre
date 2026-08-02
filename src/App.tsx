import { useCallback, useMemo, useRef, useState } from "react";
import {
  parseRepoUrl,
  resolveRepo,
  fetchRepoTree,
  formatBytes,
  type RepoNode,
} from "./lib/github";
import { buildGraph } from "./lib/graph";
import { layoutGraph, type LayoutResult } from "./lib/elk-layout";
import "./App.css";

type Phase = "idle" | "loading" | "layout" | "ready" | "error";

interface SelectedFile {
  path: string;
  size?: number;
}

export default function App() {
  const [input, setInput] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState("");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [tree, setTree] = useState<RepoNode[]>([]);
  const [layout, setLayout] = useState<LayoutResult | null>(null);
  const [selected, setSelected] = useState<SelectedFile | null>(null);
  const [repoLabel, setRepoLabel] = useState("");
  const layoutToken = useRef(0);

  const fileCount = useMemo(() => tree.filter((n) => n.type === "blob").length, [tree]);
  const dirCount = useMemo(() => tree.filter((n) => n.type === "tree").length, [tree]);

  const handleFetch = useCallback(async () => {
    const parsed = parseRepoUrl(input);
    if (!parsed) {
      setError('Enter a valid repo like "facebook/react" or a full GitHub URL.');
      setPhase("error");
      return;
    }

    const token = ++layoutToken.current;
    setPhase("loading");
    setError("");
    setProgress({ done: 0, total: 1 });
    setLayout(null);
    setSelected(null);
    setTree([]);

    try {
      setProgress({ done: 0, total: 2 });
      const resolved = await resolveRepo(parsed);
      if (token !== layoutToken.current) return;
      setProgress({ done: 1, total: 2 });

      const repoTree = await fetchRepoTree(resolved.owner, resolved.repo, resolved.branch);
      if (token !== layoutToken.current) return;
      setTree(repoTree);
      setRepoLabel(`${resolved.owner}/${resolved.repo}`);
      setProgress({ done: 2, total: 2 });
      setPhase("layout");

      const { nodes, edges } = buildGraph(repoTree);
      const result = await layoutGraph(nodes, edges);
      if (token !== layoutToken.current) return;
      setLayout(result);
      setPhase("ready");
      setProgress(null);
    } catch (e) {
      if (token !== layoutToken.current) return;
      setError(e instanceof Error ? e.message : "Something went wrong fetching the repository.");
      setPhase("error");
      setProgress(null);
    }
  }, [input]);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && phase !== "loading" && phase !== "layout") handleFetch();
  };

  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          <Logo />
          <span className="brand-name">Repodre</span>
        </div>
        <div className="search-row">
          <div className="search-wrap">
            <SearchIcon />
            <input
              className="search-input"
              placeholder="owner/repo  or  paste a GitHub URL"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              spellCheck={false}
              autoComplete="off"
            />
          </div>
          <button
            className="btn-fetch"
            onClick={handleFetch}
            disabled={phase === "loading" || phase === "layout"}
          >
            {phase === "loading" || phase === "layout" ? "Working…" : "Visualize"}
          </button>
        </div>
      </header>

      <main className="main">
        {phase === "idle" && <EmptyState onExample={setInput} />}
        {(phase === "loading" || phase === "layout") && (
          <LoadingState phase={phase} progress={progress} repoLabel={repoLabel} />
        )}
        {phase === "error" && <ErrorState message={error} />}
        {phase === "ready" && layout && (
          <GraphView
            layout={layout}
            tree={tree}
            selected={selected}
            onSelect={setSelected}
            repoLabel={repoLabel}
            fileCount={fileCount}
            dirCount={dirCount}
          />
        )}
      </main>
    </div>
  );
}

function Logo() {
  return (
    <svg className="logo" viewBox="0 0 32 32" width="28" height="28">
      <rect width="32" height="32" rx="7" fill="#0ea5e9" />
      <circle cx="9" cy="16" r="3" fill="#fff" />
      <circle cx="23" cy="9" r="3" fill="#fff" />
      <circle cx="23" cy="23" r="3" fill="#fff" />
      <path d="M11.5 14.5L20.5 10.5M11.5 17.5L20.5 21.5" stroke="#fff" strokeWidth="1.6" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg className="search-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" strokeLinecap="round" />
    </svg>
  );
}

function EmptyState({ onExample }: { onExample: (v: string) => void }) {
  return (
    <div className="state empty">
      <div className="state-art">
        <svg viewBox="0 0 120 100" width="160" height="134">
          <circle cx="20" cy="50" r="9" fill="#1c2640" stroke="#38bdf8" strokeWidth="1.5" />
          <circle cx="60" cy="25" r="9" fill="#1c2640" stroke="#34d399" strokeWidth="1.5" />
          <circle cx="60" cy="75" r="9" fill="#1c2640" stroke="#f59e0b" strokeWidth="1.5" />
          <circle cx="100" cy="50" r="9" fill="#1c2640" stroke="#38bdf8" strokeWidth="1.5" />
          <path d="M29 50 L51 25 M29 50 L51 75 M69 25 L91 50 M69 75 L91 50" stroke="#2f3d5c" strokeWidth="1.5" fill="none" />
        </svg>
      </div>
      <h2>Visualize any GitHub repository</h2>
      <p>Enter a repository above to see its file structure as an interactive graph.</p>
      <div className="examples">
        <button onClick={() => onExample("facebook/react")}>facebook/react</button>
        <button onClick={() => onExample("vercel/next.js")}>vercel/next.js</button>
        <button onClick={() => onExample("torvalds/linux")}>torvalds/linux</button>
      </div>
    </div>
  );
}

function LoadingState({
  phase,
  progress,
  repoLabel,
}: {
  phase: string;
  progress: { done: number; total: number } | null;
  repoLabel: string;
}) {
  const label =
    phase === "loading"
      ? `Fetching ${repoLabel || "repository"}…`
      : "Computing graph layout…";
  const pct = progress ? Math.round((progress.done / progress.total) * 100) : 0;
  return (
    <div className="state loading">
      <div className="spinner-ring" />
      <h2>{label}</h2>
      {progress && (
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${pct}%` }} />
        </div>
      )}
      <p>This uses GitHub's tree API — one request for the whole repo, no per-file fetching.</p>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="state error-state">
      <div className="error-icon">!</div>
      <h2>Couldn't load the repository</h2>
      <p>{message}</p>
    </div>
  );
}

interface GraphViewProps {
  layout: LayoutResult;
  tree: RepoNode[];
  selected: SelectedFile | null;
  onSelect: (f: SelectedFile | null) => void;
  repoLabel: string;
  fileCount: number;
  dirCount: number;
}

function GraphView({
  layout,
  tree,
  selected,
  onSelect,
  repoLabel,
  fileCount,
  dirCount,
}: GraphViewProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  const bounds = useMemo(() => {
    let maxX = 0;
    let maxY = 0;
    for (const n of layout.nodes) {
      maxX = Math.max(maxX, n.x + n.width);
      maxY = Math.max(maxY, n.y + n.height);
    }
    return { width: maxX + 40, height: maxY + 40 };
  }, [layout]);

  const nodeByPath = useMemo(() => {
    const m = new Map<string, { type: "dir" | "file"; path: string }>();
    for (const n of tree) m.set(n.path, { type: n.type === "tree" ? "dir" : "file", path: n.path });
    return m;
  }, [tree]);

  return (
    <div className="graph-view">
      <div className="graph-toolbar">
        <div className="repo-meta">
          <span className="repo-name">{repoLabel}</span>
          <span className="meta-pill">{dirCount} dirs</span>
          <span className="meta-pill">{fileCount} files</span>
        </div>
      </div>
      <div className="graph-scroll">
        <svg
          ref={svgRef}
          width={bounds.width}
          height={bounds.height}
          className="graph-svg"
        >
          <defs>
            <marker
              id="arrow"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#2f3d5c" />
            </marker>
          </defs>
          <g className="edges">
            {layout.edges.map((e) => {
              const start = e.sections[0]?.startPoint;
              if (!start) return null;
              const pts = e.sections[0]?.endPoint || [];
              const d = [`M ${start.x} ${start.y}`, ...pts.map((p) => `L ${p.x} ${p.y}`)].join(" ");
              return <path key={e.id} d={d} stroke="#2f3d5c" strokeWidth="1.2" fill="none" markerEnd="url(#arrow)" />;
            })}
          </g>
          <g className="nodes">
            {layout.nodes.map((n) => {
              const info = nodeByPath.get(n.id);
              const isDir = info?.type === "dir";
              const isSelected = selected?.path === n.id;
              return (
                <g
                  key={n.id}
                  transform={`translate(${n.x}, ${n.y})`}
                  className="gnode"
                  onClick={() => onSelect({ path: n.id, size: tree.find((t) => t.path === n.id)?.size })}
                >
                  <rect
                    width={n.width}
                    height={n.height}
                    rx="7"
                    className={isSelected ? "node-rect selected" : "node-rect"}
                    data-dir={isDir ? "1" : "0"}
                  />
                  {isDir ? <FolderIcon x={10} y={12} /> : <FileIcon x={10} y={12} />}
                  <text
                    x={32}
                    y={n.height / 2 + 1}
                    dominantBaseline="middle"
                    className="node-label"
                  >
                    {truncate(n.id.split("/").pop() || n.id, 18)}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>
      {selected && (
        <div className="detail-panel">
          <div className="detail-head">
            <span className="detail-title">{selected.path.split("/").pop()}</span>
            <button className="close-btn" onClick={() => onSelect(null)}>×</button>
          </div>
          <div className="detail-path">{selected.path}</div>
          {selected.size != null && (
            <div className="detail-row">
              <span>Size</span>
              <span>{formatBytes(selected.size)}</span>
            </div>
          )}
          <a
            className="detail-link"
            href={`https://github.com/${repoLabel}/blob/HEAD/${selected.path}`}
            target="_blank"
            rel="noreferrer"
          >
            View on GitHub →
          </a>
        </div>
      )}
    </div>
  );
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function FolderIcon({ x, y }: { x: number; y: number }) {
  return (
    <svg x={x} y={y} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" strokeLinejoin="round" />
    </svg>
  );
}

function FileIcon({ x, y }: { x: number; y: number }) {
  return (
    <svg x={x} y={y} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2">
      <path d="M14 3v5h5M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" strokeLinejoin="round" />
    </svg>
  );
}
