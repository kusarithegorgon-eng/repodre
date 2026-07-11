/**
 * FloatingControls — Bottom-Left Toolbar
 *
 * A floating container for View/Validation controls (shape picker, accent picker).
 * Minimalist design that sits in the bottom-left corner of the canvas.
 */

import { useState } from "react";
import { ShapeIcon } from "@/components/NodeShapeSVG";
import type { Shape } from "@/lib/canvas-geometry";
import type { Accent } from "@/lib/db-client";

type NodeAccent = "green" | "purple" | "teal" | "blue" | "orange" | "red";

interface FloatingControlsProps {
  selectedShape: Shape | null;
  selectedAccent: NodeAccent | null;
  hasSelection: boolean;
  onShapeChange: (shape: Shape) => void;
  onAccentChange: (accent: NodeAccent) => void;
}

const SHAPES: Shape[] = ["rectangle", "pill", "diamond", "cylinder", "hexagon", "parallelogram", "document", "triangle"];

const ACCENTS: { accent: NodeAccent; color: string; label: string }[] = [
  { accent: "green", color: "var(--node-view-stroke)", label: "View/Endpoint" },
  { accent: "teal", color: "var(--node-controller-stroke)", label: "Controller" },
  { accent: "blue", color: "var(--node-database-stroke)", label: "Database" },
  { accent: "purple", color: "var(--node-validation-stroke)", label: "Validation" },
  { accent: "orange", color: "var(--node-gateway-stroke)", label: "Gateway" },
  { accent: "red", color: "var(--node-error-stroke)", label: "Error" },
];

export function FloatingControls({
  selectedShape,
  selectedAccent,
  hasSelection,
  onShapeChange,
  onAccentChange,
}: FloatingControlsProps) {
  const [expanded, setExpanded] = useState(false);

  if (!hasSelection) return null;

  return (
    <div className="fixed bottom-4 left-[68px] z-40 flex flex-col gap-2">
      {/* Collapsed toggle button */}
      <button
        onClick={() => setExpanded(!expanded)}
        className={`flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-surface text-muted-foreground shadow-lg transition-all hover:bg-accent hover:text-foreground ${
          expanded ? "ring-2 ring-teal/50" : ""
        }`}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="2" y="4" width="12" height="8" rx="2" />
          <circle cx="6" cy="8" r="1.5" fill="currentColor" />
        </svg>
      </button>

      {/* Expanded controls */}
      {expanded && (
        <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-3 shadow-2xl animate-in slide-in-from-bottom-2 duration-200">
          {/* Shape picker */}
          <div className="flex flex-wrap gap-1">
            {SHAPES.slice(0, 6).map((shape) => (
              <button
                key={shape}
                onClick={() => onShapeChange(shape)}
                title={shape.charAt(0).toUpperCase() + shape.slice(1)}
                className={`flex h-8 w-9 items-center justify-center rounded-md border transition-all ${
                  selectedShape === shape
                    ? "border-teal/50 bg-teal/10 text-teal shadow-sm"
                    : "border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                <ShapeIcon shape={shape} className="h-4 w-4" />
              </button>
            ))}
          </div>

          {/* Accent picker */}
          <div className="flex gap-1">
            {ACCENTS.map(({ accent, color, label }) => (
              <button
                key={accent}
                onClick={() => onAccentChange(accent)}
                title={label}
                className={`flex h-8 w-8 items-center justify-center rounded-md border transition-all ${
                  selectedAccent === accent
                    ? "border-teal/50 shadow-sm ring-1 ring-teal/30"
                    : "border-border bg-background hover:bg-accent"
                }`}
              >
                <span
                  className="h-4 w-4 rounded-full"
                  style={{ backgroundColor: color }}
                />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
