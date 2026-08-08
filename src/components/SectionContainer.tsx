/**
 * SectionContainer — Figma-style section grouping on the canvas.
 *
 * Renders a large rounded rectangle behind nodes. Nodes whose center falls
 * within the section bounds are treated as children. Supports:
 *  - Custom title label + color tag
 *  - "Ready for Dev" status toggle that changes the accent color
 *  - Drag to move (batch-moves all contained child nodes)
 *  - Resize from bottom-right corner (children stay in place)
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Trash2, Maximize2 } from "lucide-react";
import type { Section, SectionColor, DevStatus } from "@/lib/db-client";

const SECTION_COLORS: Record<SectionColor, { bg: string; border: string; header: string; glow: string }> = {
  blue:   { bg: "rgba(59, 130, 246, 0.06)",  border: "rgba(59, 130, 246, 0.35)",  header: "rgba(59, 130, 246, 0.12)",  glow: "rgba(59, 130, 246, 0.15)" },
  green:  { bg: "rgba(34, 197, 94, 0.06)",    border: "rgba(34, 197, 94, 0.35)",    header: "rgba(34, 197, 94, 0.12)",    glow: "rgba(34, 197, 94, 0.15)" },
  teal:   { bg: "rgba(20, 184, 166, 0.06)",   border: "rgba(20, 184, 166, 0.35)",   header: "rgba(20, 184, 166, 0.12)",   glow: "rgba(20, 184, 166, 0.15)" },
  orange: { bg: "rgba(249, 115, 22, 0.06)",   border: "rgba(249, 115, 22, 0.35)",   header: "rgba(249, 115, 22, 0.12)",   glow: "rgba(249, 115, 22, 0.15)" },
  red:    { bg: "rgba(239, 68, 68, 0.06)",    border: "rgba(239, 68, 68, 0.35)",    header: "rgba(239, 68, 68, 0.12)",    glow: "rgba(239, 68, 68, 0.15)" },
  purple: { bg: "rgba(168, 85, 247, 0.06)",   border: "rgba(168, 85, 247, 0.35)",   header: "rgba(168, 85, 247, 0.12)",   glow: "rgba(168, 85, 247, 0.15)" },
  slate:  { bg: "rgba(100, 116, 139, 0.06)",  border: "rgba(100, 116, 139, 0.35)",  header: "rgba(100, 116, 139, 0.12)",  glow: "rgba(100, 116, 139, 0.15)" },
};

const READY_COLOR: SectionColor = "green";

const COLOR_SWATCHES: SectionColor[] = ["blue", "green", "teal", "orange", "red", "purple", "slate"];

const HEADER_HEIGHT = 36;
const MIN_W = 200;
const MIN_H = 140;

interface SectionContainerProps {
  section: Section;
  selected: boolean;
  zoom: number;
  childCount: number;
  onSelect: (id: string | null) => void;
  onUpdate: (id: string, updates: Partial<Pick<Section, "label" | "color" | "x" | "y" | "w" | "h" | "devStatus">>) => void;
  onDelete: (id: string) => void;
  /** Called continuously during a drag with the delta (dx, dy) in canvas coords. */
  onDragChildren: (sectionId: string, dx: number, dy: number) => void;
  /** Called once when a move-drag ends (mouseup) — use to persist child positions. */
  onDragEnd?: () => void;
  /** Called when the user clicks the Fit-to-Content button. */
  onFitToContent?: (id: string) => void;
}

export function SectionContainer({
  section,
  selected,
  zoom,
  childCount,
  onSelect,
  onUpdate,
  onDelete,
  onDragChildren,
  onDragEnd,
  onFitToContent,
}: SectionContainerProps) {
  const [isEditingLabel, setIsEditingLabel] = useState(false);
  const [labelDraft, setLabelDraft] = useState(section.label);
  const [showColorPicker, setShowColorPicker] = useState(false);

  const dragState = useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    mode: "move" | "resize";
  } | null>(null);

  const colors = SECTION_COLORS[section.color] ?? SECTION_COLORS.blue;
  const isReady = section.devStatus === "ready";
  const accentColor = isReady ? SECTION_COLORS[READY_COLOR] : colors;

  // ─── Drag to move / resize ──────────────────────────────────────────────
  const handleMouseDown = useCallback(
    (e: React.MouseEvent, mode: "move" | "resize") => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      onSelect(section.id);
      dragState.current = {
        startX: e.clientX,
        startY: e.clientY,
        originX: section.x,
        originY: section.y,
        mode,
      };
    },
    [onSelect, section.id, section.x, section.y]
  );

  useEffect(() => {
    const onMove = (mv: MouseEvent) => {
      const ds = dragState.current;
      if (!ds) return;
      const dx = (mv.clientX - ds.startX) / (zoom / 100);
      const dy = (mv.clientY - ds.startY) / (zoom / 100);

      if (ds.mode === "move") {
        const newX = snap(ds.originX + dx);
        const newY = snap(ds.originY + dy);
        const actualDx = newX - section.x;
        const actualDy = newY - section.y;
        if (actualDx !== 0 || actualDy !== 0) {
          onUpdate(section.id, { x: newX, y: newY });
          onDragChildren(section.id, actualDx, actualDy);
        }
      } else {
        const newW = Math.max(MIN_W, snap(ds.originX + section.w + dx) - ds.originX);
        const newH = Math.max(MIN_H, snap(ds.originY + section.h + dy) - ds.originY);
        onUpdate(section.id, { w: newW, h: newH });
      }
    };

    const onUp = () => {
      if (dragState.current?.mode === "move") {
        onDragEnd?.();
      }
      dragState.current = null;
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [zoom, section.id, section.x, section.y, section.w, section.h, onUpdate, onDragChildren, onDragEnd]);

  // ─── Label editing ──────────────────────────────────────────────────────
  const commitLabel = useCallback(() => {
    setIsEditingLabel(false);
    const trimmed = labelDraft.trim();
    if (trimmed && trimmed !== section.label) {
      onUpdate(section.id, { label: trimmed });
    } else {
      setLabelDraft(section.label);
    }
  }, [labelDraft, section.label, onUpdate, section.id]);

  const toggleDevStatus = useCallback(() => {
    const next: DevStatus = isReady ? "draft" : "ready";
    onUpdate(section.id, { devStatus: next });
  }, [isReady, onUpdate, section.id]);

  return (
    <div
      className="absolute"
      style={{
        left: section.x,
        top: section.y,
        width: section.w,
        height: section.h,
        zIndex: 0,
      }}
      onMouseDown={(e) => handleMouseDown(e, "move")}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(section.id);
      }}
    >
      {/* Section body */}
      <div
        className="absolute inset-0 rounded-2xl transition-all duration-200"
        style={{
          background: accentColor.bg,
          border: `2px ${selected ? "solid" : "dashed"} ${accentColor.border}`,
          boxShadow: selected ? `0 0 0 1px ${accentColor.glow}, 0 4px 24px ${accentColor.glow}` : "none",
        }}
      />

      {/* Header bar */}
      <div
        className="absolute top-0 left-0 right-0 flex items-center gap-2 px-3 rounded-t-2xl"
        style={{
          height: HEADER_HEIGHT,
          background: accentColor.header,
          borderBottom: `1px solid ${accentColor.border}`,
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Color swatch / picker */}
        <div className="relative">
          <button
            className="h-4 w-4 rounded-full border-2 border-white/60 shadow-sm transition-transform hover:scale-110"
            style={{ background: swatchHex(section.color) }}
            onClick={(e) => {
              e.stopPropagation();
              setShowColorPicker((v) => !v);
            }}
            title="Section color"
          />
          {showColorPicker && (
            <div
              className="absolute top-6 left-0 z-50 flex gap-1.5 rounded-lg border border-border bg-popover p-2 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              {COLOR_SWATCHES.map((c) => (
                <button
                  key={c}
                  className="h-5 w-5 rounded-full border-2 transition-transform hover:scale-125"
                  style={{
                    background: swatchHex(c),
                    borderColor: section.color === c ? "var(--foreground)" : "rgba(255,255,255,0.4)",
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onUpdate(section.id, { color: c });
                    setShowColorPicker(false);
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {/* Label (editable) */}
        {isEditingLabel ? (
          <input
            autoFocus
            value={labelDraft}
            onChange={(e) => setLabelDraft(e.target.value)}
            onBlur={commitLabel}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitLabel();
              if (e.key === "Escape") {
                setLabelDraft(section.label);
                setIsEditingLabel(false);
              }
            }}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 bg-transparent text-sm font-semibold text-foreground outline-none border-b border-foreground/40"
            style={{ maxWidth: section.w - 180 }}
          />
        ) : (
          <button
            className="flex-1 truncate text-left text-sm font-semibold text-foreground/90 hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation();
              setLabelDraft(section.label);
              setIsEditingLabel(true);
            }}
          >
            {section.label}
          </button>
        )}

        {/* Child count badge */}
        <span
          className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold"
          style={{ background: accentColor.border, color: "var(--foreground)" }}
        >
          {childCount} {childCount === 1 ? "node" : "nodes"}
        </span>

        {/* Ready for Dev toggle */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleDevStatus();
          }}
          className="shrink-0 flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-bold transition-all"
          style={{
            background: isReady ? "rgba(34, 197, 94, 0.2)" : "transparent",
            border: `1px solid ${isReady ? "rgba(34, 197, 94, 0.5)" : accentColor.border}`,
            color: isReady ? "rgb(22, 163, 74)" : "var(--muted-foreground)",
          }}
          title={isReady ? "Marked as Ready for Dev — click to revert" : "Mark as Ready for Dev"}
        >
          <Check className="h-3 w-3" />
          {isReady ? "Ready for Dev" : "Draft"}
        </button>

        {/* Fit to Content */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onFitToContent?.(section.id);
          }}
          className="shrink-0 flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-primary/15 hover:text-primary"
          title="Fit section to contained nodes"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </button>

        {/* Delete */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(section.id);
          }}
          className="shrink-0 flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-red-500/15 hover:text-red-500"
          title="Delete section (nodes stay)"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Resize handle (bottom-right) */}
      <div
        className="absolute -bottom-1 -right-1 h-5 w-5 cursor-nwse-resize rounded-bl-md"
        style={{
          background: accentColor.border,
          clipPath: "polygon(100% 0, 100% 100%, 0 100%)",
        }}
        onMouseDown={(e) => handleMouseDown(e, "resize")}
      />
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const SNAP = 20;
function snap(v: number): number {
  return Math.round(v / SNAP) * SNAP;
}

function swatchHex(color: SectionColor): string {
  const map: Record<SectionColor, string> = {
    blue: "#3b82f6",
    green: "#22c55e",
    teal: "#14b8a6",
    orange: "#f97316",
    red: "#ef4444",
    purple: "#a855f7",
    slate: "#64748b",
  };
  return map[color] ?? map.blue;
}

/** Check if a point (px, py) falls within the section bounds. */
export function isPointInSection(
  px: number,
  py: number,
  section: { x: number; y: number; w: number; h: number }
): boolean {
  return (
    px >= section.x &&
    px <= section.x + section.w &&
    py >= section.y &&
    py <= section.y + section.h
  );
}

/** Find the section that contains a node center, if any. */
export function findSectionForNode(
  nodeCenter: { x: number; y: number },
  sections: Array<{ id: string; x: number; y: number; w: number; h: number }>
): string | null {
  for (const s of sections) {
    if (isPointInSection(nodeCenter.x, nodeCenter.y, s)) {
      return s.id;
    }
  }
  return null;
}
