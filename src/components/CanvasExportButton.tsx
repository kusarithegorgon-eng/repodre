/**
 * CanvasExportButton — High-Resolution Visual Export Toolbar
 *
 * A dropdown button adjacent to viewport controls that allows users
 * to download the active canvas as PNG, SVG, or Mermaid.js text syntax.
 * Mermaid output can also be copied to the clipboard for pasting into
 * README.md files, PRs, and docs.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { Download, ChevronDown, Image, FileCode, Check, Loader as Loader2, FileText, Copy } from "lucide-react";
import { exportCanvas, type ExportFormat } from "@/lib/canvas-export";
import {
  exportToMermaid,
  downloadMermaid,
  copyMermaidToClipboard,
} from "@/lib/mermaid-export";
import type { Node as CanvasNode, Edge } from "@/lib/db-client";

interface CanvasExportButtonProps {
  getCanvasContainer: () => HTMLElement | null;
  nodes: CanvasNode[];
  edges: Edge[];
  workspace: "app" | "erd";
  disabled?: boolean;
}

type ExportKind = ExportFormat | "mermaid" | "copy-mermaid";

export function CanvasExportButton({
  getCanvasContainer,
  nodes,
  edges,
  workspace,
  disabled,
}: CanvasExportButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [justExported, setJustExported] = useState<ExportKind | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as globalThis.Node)) {
        setIsOpen(false);
      }
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [isOpen]);

  const flashDone = (kind: ExportKind) => {
    setJustExported(kind);
    setTimeout(() => setJustExported(null), 2000);
  };

  const handleVisualExport = useCallback(
    async (format: ExportFormat) => {
      const container = getCanvasContainer();
      if (!container) return;

      setIsExporting(true);
      try {
        await exportCanvas(container, format, {
          scale: 2,
          filename: `repodre-diagram-${Date.now()}`,
        });
        flashDone(format);
        setIsOpen(false);
      } catch (err) {
        console.error("Export failed:", err);
      } finally {
        setIsExporting(false);
      }
    },
    [getCanvasContainer]
  );

  const handleMermaidDownload = useCallback(() => {
    const mermaid = exportToMermaid(nodes, edges, workspace);
    downloadMermaid(mermaid, `repodre-diagram-${Date.now()}`);
    flashDone("mermaid");
    setIsOpen(false);
  }, [nodes, edges, workspace]);

  const handleMermaidCopy = useCallback(async () => {
    const mermaid = exportToMermaid(nodes, edges, workspace);
    const ok = await copyMermaidToClipboard(mermaid);
    if (ok) {
      flashDone("copy-mermaid");
      setIsOpen(false);
    }
  }, [nodes, edges, workspace]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setIsOpen((v) => !v)}
        disabled={disabled || isExporting}
        title="Download canvas as PNG, SVG, or Mermaid"
        className="flex h-9 items-center gap-2 rounded-lg border border-border bg-background px-3 text-xs font-medium text-foreground transition-all hover:border-teal hover:text-teal disabled:cursor-not-allowed disabled:opacity-40"
      >
        {isExporting ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Download className="h-3.5 w-3.5" />
        )}
        Download
        <ChevronDown className={`h-3 w-3 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full z-30 mt-2 w-60 rounded-lg border border-border bg-popover p-1.5 shadow-xl animate-fade-in">
          <p className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Image & vector
          </p>
          <ExportOption
            icon={<Image className="h-4 w-4" />}
            label="PNG Image"
            description="High-res raster at 2x density"
            onClick={() => handleVisualExport("png")}
            justExported={justExported === "png"}
          />
          <ExportOption
            icon={<FileCode className="h-4 w-4" />}
            label="SVG Vector"
            description="Scalable for READMEs & docs"
            onClick={() => handleVisualExport("svg")}
            justExported={justExported === "svg"}
          />

          <div className="my-1 h-px bg-border" />

          <p className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Mermaid.js text
          </p>
          <ExportOption
            icon={<FileText className="h-4 w-4" />}
            label="Download .mmd"
            description="Mermaid syntax for READMEs"
            onClick={handleMermaidDownload}
            justExported={justExported === "mermaid"}
          />
          <ExportOption
            icon={<Copy className="h-4 w-4" />}
            label="Copy to clipboard"
            description="Paste straight into markdown"
            onClick={handleMermaidCopy}
            justExported={justExported === "copy-mermaid"}
          />
        </div>
      )}
    </div>
  );
}

function ExportOption({
  icon,
  label,
  description,
  onClick,
  justExported,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  onClick: () => void;
  justExported: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-accent"
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface text-muted-foreground">
        {icon}
      </div>
      <div className="flex-1">
        <div className="text-sm font-medium text-foreground">{label}</div>
        <div className="text-[10px] text-muted-foreground">{description}</div>
      </div>
      {justExported && (
        <Check className="h-4 w-4 shrink-0 text-teal" />
      )}
    </button>
  );
}
