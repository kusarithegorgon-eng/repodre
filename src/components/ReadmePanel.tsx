import { useState, useCallback } from "react";
import { FileText, Download, X, Loader2, Copy, Check } from "lucide-react";
import { generateReadme } from "@/lib/readme-generator";
import type { NodeData, EdgeData } from "@/lib/canvas-geometry";

interface ReadmePanelProps {
  isOpen: boolean;
  onClose: () => void;
  nodes: NodeData[];
  edges: EdgeData[];
  projectName: string;
  workspace: "app" | "erd";
}

export function ReadmePanel({ isOpen, onClose, nodes, edges, projectName, workspace }: ReadmePanelProps) {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const md = await generateReadme(nodes, edges, projectName, workspace);
      setContent(md);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate README");
    } finally { setLoading(false); }
  }, [nodes, edges, projectName, workspace]);

  const handleDownload = () => {
    const blob = new Blob([content], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "ARCHITECTURE.md";
    a.click();
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="absolute left-4 top-4 z-50 w-96 rounded-xl border p-4 shadow-2xl backdrop-blur"
      style={{ background: "color-mix(in srgb, var(--popover) 95%, transparent)", borderColor: "var(--border)" }}>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4" style={{ color: "var(--teal)" }} />
          <h3 className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>Architecture README Generator</h3>
        </div>
        <button onClick={onClose} className="flex h-6 w-6 items-center justify-center rounded hover:bg-accent" style={{ color: "var(--muted-foreground)" }}><X className="h-4 w-4" /></button>
      </div>

      {error && <div className="mb-3 rounded-lg border px-3 py-2 text-xs" style={{ borderColor: "color-mix(in srgb, var(--red) 30%, transparent)", color: "var(--red)" }}>{error}</div>}

      {!content ? (
        <div className="py-6 text-center">
          <p className="mb-4 text-xs" style={{ color: "var(--muted-foreground)" }}>Generate a README.md from the current canvas state — components, connections, schema, and complexity metrics.</p>
          <button onClick={handleGenerate} disabled={loading}
            className="flex items-center justify-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium text-white transition-all hover:opacity-90 disabled:opacity-40"
            style={{ background: "var(--teal)" }}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><FileText className="h-4 w-4" /> Generate README</>}
          </button>
        </div>
      ) : (
        <div>
          <div className="mb-2 flex gap-2">
            <button onClick={handleDownload} className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-all hover:bg-accent" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}>
              <Download className="h-3.5 w-3.5" /> Download .md
            </button>
            <button onClick={handleCopy} className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-all hover:bg-accent" style={{ borderColor: "var(--border)", color: "var(--foreground)" }}>
              {copied ? <Check className="h-3.5 w-3.5" style={{ color: "var(--green)" }} /> : <Copy className="h-3.5 w-3.5" />} Copy
            </button>
            <button onClick={handleGenerate} className="ml-auto rounded-md border px-3 py-1.5 text-xs font-medium transition-all hover:bg-accent" style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}>Regenerate</button>
          </div>
          <pre className="max-h-[400px] overflow-auto rounded-lg border p-3 text-[11px] font-mono whitespace-pre-wrap scrollbar-thin" style={{ background: "var(--background)", borderColor: "var(--border)", color: "var(--foreground)" }}>{content}</pre>
        </div>
      )}
    </div>
  );
}
