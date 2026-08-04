/**
 * CanvasExportButton — High-Resolution Visual Export Toolbar
 *
 * A dropdown button adjacent to viewport controls that allows users
 * to download the active canvas as PNG or SVG at 2x pixel density.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { Download, ChevronDown, Image, FileCode, Check, Loader2 } from "lucide-react";
import { exportCanvas, type ExportFormat } from "@/lib/canvas-export";

interface CanvasExportButtonProps {
  getCanvasContainer: () => HTMLElement | null;
  disabled?: boolean;
}

export function CanvasExportButton({
  getCanvasContainer,
  disabled,
}: CanvasExportButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [justExported, setJustExported] = useState<ExportFormat | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [isOpen]);

  const handleExport = useCallback(
    async (format: ExportFormat) => {
      const container = getCanvasContainer();
      if (!container) return;

      setIsExporting(true);
      try {
        await exportCanvas(container, format, {
          scale: 2,
          filename: `repodre-diagram-${Date.now()}`,
        });
        setJustExported(format);
        setTimeout(() => setJustExported(null), 2000);
        setIsOpen(false);
      } catch (err) {
        console.error("Export failed:", err);
      } finally {
        setIsExporting(false);
      }
    },
    [getCanvasContainer]
  );

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setIsOpen((v) => !v)}
        disabled={disabled || isExporting}
        title="Download canvas as PNG or SVG"
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
        <div className="absolute right-0 top-full z-30 mt-2 w-56 rounded-lg border border-border bg-popover p-1.5 shadow-xl animate-fade-in">
          <p className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Export format
          </p>
          <ExportOption
            icon={<Image className="h-4 w-4" />}
            label="PNG Image"
            description="High-res raster at 2x density"
            onClick={() => handleExport("png")}
            justExported={justExported === "png"}
          />
          <ExportOption
            icon={<FileCode className="h-4 w-4" />}
            label="SVG Vector"
            description="Scalable for READMEs & docs"
            onClick={() => handleExport("svg")}
            justExported={justExported === "svg"}
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
