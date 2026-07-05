/**
 * NodeShapeSVG
 *
 * Renders the visual boundary of a canvas node as an absolutely-positioned
 * SVG layer. Each shape variant uses a precise SVG path so that:
 *   – connector cables can be anchored to the true perimeter via
 *     the geometry engine's polygon intersection math, and
 *   – text content is safely clipped within the inscribed safe zone.
 *
 * HIGH-CONTRAST ACADEMIC DESIGN:
 *   - 100% FLAT design (no glows, no gradients, no drop-shadows)
 *   - Soft pastel fills with dark solid borders
 *   - High legibility for academic evaluation
 */

import type { Shape } from "@/lib/canvas-geometry";
import { CYLINDER_CAP } from "@/lib/canvas-geometry";

/**
 * Node type for determining fill/stroke colors from CSS variables.
 */
export type NodeType = "view" | "controller" | "validation" | "database" | "error" | "gateway" | "misc" | "bridge";

interface NodeShapeSVGProps {
  shape: Shape;
  width: number;
  height: number;
  color: string;
  glow: string;
  selected: boolean;
  /** Node type for academic palette (view, controller, validation, database, error, gateway) */
  nodeType?: NodeType;
  /** extra CSS class for the wrapping <svg> element */
  className?: string;
}

/**
 * Gets the fill color CSS variable for a node type.
 */
function getFillForType(type: NodeType | undefined): string {
  switch (type) {
    case "view":
      return "var(--node-view-fill)";
    case "controller":
      return "var(--node-controller-fill)";
    case "validation":
      return "var(--node-validation-fill)";
    case "database":
      return "var(--node-database-fill)";
    case "error":
      return "var(--node-error-fill)";
    case "gateway":
      return "var(--node-gateway-fill)";
    case "misc":
      return "var(--node-misc-fill, #f5f5f5)";
    case "bridge":
      return "var(--node-bridge-fill, #e2e8f0)";
    default:
      return "#ffffff";
  }
}

/**
 * Gets the stroke color CSS variable for a node type.
 */
function getStrokeForType(type: NodeType | undefined, fallbackColor: string): string {
  switch (type) {
    case "view":
      return "var(--node-view-stroke)";
    case "controller":
      return "var(--node-controller-stroke)";
    case "validation":
      return "var(--node-validation-stroke)";
    case "database":
      return "var(--node-database-stroke)";
    case "error":
      return "var(--node-error-stroke)";
    case "gateway":
      return "var(--node-gateway-stroke)";
    case "misc":
      return "var(--node-misc-stroke, #78716c)";
    case "bridge":
      return "var(--node-bridge-stroke, #475569)";
    default:
      return fallbackColor;
  }
}

export function NodeShapeSVG({
  shape,
  width,
  height,
  color,
  glow: _glow, // Unused in academic design
  selected,
  nodeType,
  className = "",
}: NodeShapeSVGProps) {
  const strokeW = 2;

  // HIGH-CONTRAST ACADEMIC PALETTE
  // NO drop-shadow, NO glow - completely flat design
  const flatFill = getFillForType(nodeType);
  const flatStroke = getStrokeForType(nodeType, color);

  // Selected state: slightly thicker border, NO glow
  const effectiveStrokeW = selected ? strokeW + 1 : strokeW;
  const selectedRing = selected ? "2px solid var(--teal)" : "none";

  switch (shape) {
    // ── Pill (stadium) - View/Endpoint nodes ─────────────────────────────────
    case "pill":
      return (
        <svg
          className={`absolute inset-0 ${className}`}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          fill="none"
          style={{ overflow: "visible", outline: selectedRing, outlineOffset: "2px" }}
        >
          <rect
            x={effectiveStrokeW / 2}
            y={effectiveStrokeW / 2}
            width={width - effectiveStrokeW}
            height={height - effectiveStrokeW}
            rx={height / 2}
            fill={flatFill}
            stroke={flatStroke}
            strokeWidth={effectiveStrokeW}
          />
        </svg>
      );

    // ── Diamond - Validation nodes ───────────────────────────────────────────
    case "diamond": {
      const mx = width / 2;
      const my = height / 2;
      const half = effectiveStrokeW / 2;
      const pts = `${mx},${half} ${width - half},${my} ${mx},${height - half} ${half},${my}`;
      return (
        <svg
          className={`absolute inset-0 ${className}`}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          fill="none"
          style={{ overflow: "visible" }}
        >
          <polygon
            points={pts}
            fill={flatFill}
            stroke={flatStroke}
            strokeWidth={effectiveStrokeW}
            strokeLinejoin="round"
          />
        </svg>
      );
    }

    // ── Cylinder / Database ──────────────────────────────────────────────────
    case "cylinder": {
      const totalH = height + CYLINDER_CAP;
      const rx = width / 2 - effectiveStrokeW;
      const ry = CYLINDER_CAP / 2;
      const bodyTop = ry;
      const bodyBot = totalH - ry;
      return (
        <svg
          className={`absolute ${className}`}
          style={{
            top: -CYLINDER_CAP / 2,
            left: 0,
            overflow: "visible",
          }}
          width={width}
          height={totalH}
          viewBox={`0 0 ${width} ${totalH}`}
          fill="none"
        >
          {/* Body rectangle - FLAT */}
          <rect
            x={effectiveStrokeW}
            y={bodyTop}
            width={width - effectiveStrokeW * 2}
            height={bodyBot - bodyTop}
            fill={flatFill}
            stroke={flatStroke}
            strokeWidth={effectiveStrokeW}
          />
          {/* Bottom ellipse - FLAT */}
          <ellipse
            cx={width / 2}
            cy={bodyBot}
            rx={rx}
            ry={ry}
            fill={flatFill}
            stroke={flatStroke}
            strokeWidth={effectiveStrokeW}
          />
          {/* Top ellipse cap - FLAT, no tint */}
          <ellipse
            cx={width / 2}
            cy={bodyTop}
            rx={rx}
            ry={ry}
            fill={flatFill}
            stroke={flatStroke}
            strokeWidth={effectiveStrokeW}
          />
        </svg>
      );
    }

    // ── Triangle ─────────────────────────────────────────────────────────────
    case "triangle": {
      const half = effectiveStrokeW / 2;
      const pts = `${width / 2},${half} ${width - half},${height - half} ${half},${height - half}`;
      return (
        <svg
          className={`absolute inset-0 ${className}`}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          fill="none"
          style={{ overflow: "visible" }}
        >
          <polygon
            points={pts}
            fill={flatFill}
            stroke={flatStroke}
            strokeWidth={effectiveStrokeW}
            strokeLinejoin="round"
          />
        </svg>
      );
    }

    // ── Parallelogram ────────────────────────────────────────────────────────
    case "parallelogram": {
      const skew = width * 0.18;
      const half = effectiveStrokeW / 2;
      const pts = [
        `${skew + half},${half}`,
        `${width - half},${half}`,
        `${width - skew - half},${height - half}`,
        `${half},${height - half}`,
      ].join(" ");
      return (
        <svg
          className={`absolute inset-0 ${className}`}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          fill="none"
          style={{ overflow: "visible" }}
        >
          <polygon
            points={pts}
            fill={flatFill}
            stroke={flatStroke}
            strokeWidth={effectiveStrokeW}
            strokeLinejoin="round"
          />
        </svg>
      );
    }

    // ── Document (rectangle with folded corner) ─────────────────────────────
    case "document": {
      const fold = 22;
      const half = effectiveStrokeW / 2;
      const r = 6;
      const d = [
        `M ${r + half} ${half}`,
        `L ${width - fold - half} ${half}`,
        `L ${width - half} ${fold + half}`,
        `L ${width - half} ${height - r - half}`,
        `Q ${width - half} ${height - half} ${width - r - half} ${height - half}`,
        `L ${r + half} ${height - half}`,
        `Q ${half} ${height - half} ${half} ${height - r - half}`,
        `L ${half} ${r + half}`,
        `Q ${half} ${half} ${r + half} ${half}`,
        "Z",
      ].join(" ");
      const foldPath = [
        `M ${width - fold - half} ${half}`,
        `L ${width - fold - half} ${fold + half}`,
        `L ${width - half} ${fold + half}`,
      ].join(" ");
      return (
        <svg
          className={`absolute inset-0 ${className}`}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          fill="none"
          style={{ overflow: "visible" }}
        >
          <path d={d} fill={flatFill} stroke={flatStroke} strokeWidth={effectiveStrokeW} strokeLinejoin="round" />
          <path d={foldPath} stroke={flatStroke} strokeWidth={effectiveStrokeW} strokeLinejoin="round" opacity={0.6} />
        </svg>
      );
    }

    // ── Hexagon (Role Gateway Switch) ───────────────────────────────────────
    case "hexagon": {
      const hw = width / 2;
      const hh = height / 2;
      const inset = width * 0.25;
      const half = effectiveStrokeW / 2;
      const pts = [
        `${hw - inset + half},${half}`,
        `${hw + inset - half},${half}`,
        `${width - half},${hh}`,
        `${hw + inset - half},${height - half}`,
        `${hw - inset + half},${height - half}`,
        `${half},${hh}`,
      ].join(" ");
      return (
        <svg
          className={`absolute inset-0 ${className}`}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          fill="none"
          style={{ overflow: "visible" }}
        >
          <polygon
            points={pts}
            fill={flatFill}
            stroke={flatStroke}
            strokeWidth={effectiveStrokeW}
            strokeLinejoin="round"
          />
        </svg>
      );
    }

    // ── Circle (Bridge / Spatial Connector) ─────────────────────────────────
    case "circle": {
      const r = Math.min(width, height) / 2 - effectiveStrokeW / 2;
      const cx = width / 2;
      const cy = height / 2;
      return (
        <svg
          className={`absolute inset-0 ${className}`}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          fill="none"
          style={{ overflow: "visible", outline: selectedRing, outlineOffset: "2px" }}
        >
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill={flatFill}
            stroke={flatStroke}
            strokeWidth={effectiveStrokeW}
            strokeDasharray="6 4"
          />
        </svg>
      );
    }

    // ── Rectangle (default) ─────────────────────────────────────────────────
    default:
      return (
        <svg
          className={`absolute inset-0 ${className}`}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          fill="none"
          style={{ overflow: "visible" }}
        >
          <rect
            x={effectiveStrokeW / 2}
            y={effectiveStrokeW / 2}
            width={width - effectiveStrokeW}
            height={height - effectiveStrokeW}
            rx={8}
            fill={flatFill}
            stroke={flatStroke}
            strokeWidth={effectiveStrokeW}
          />
        </svg>
      );
  }
}

// ── Shape icon SVGs for the toolbar ────────────────────────────────────────

/** Compact 16×16 shape preview icons for the toolbar palette. */
export function ShapeIcon({ shape }: { shape: Shape }) {
  const iconStroke = "var(--border)";

  switch (shape) {
    case "pill":
      return (
        <svg viewBox="0 0 16 8" fill="none" className="h-4 w-7">
          <rect x="0.5" y="0.5" width="15" height="7" rx="3.5" stroke={iconStroke} strokeWidth="1.2" fill="none" />
        </svg>
      );
    case "diamond":
      return (
        <svg viewBox="0 0 14 14" fill="none" className="h-4 w-4">
          <polygon points="7,1 13,7 7,13 1,7" stroke={iconStroke} strokeWidth="1.2" strokeLinejoin="round" />
        </svg>
      );
    case "cylinder":
      return (
        <svg viewBox="0 0 14 16" fill="none" className="h-4 w-4">
          <rect x="1" y="3" width="12" height="10" stroke={iconStroke} strokeWidth="1.2" fill="none" />
          <ellipse cx="7" cy="3" rx="6" ry="2.5" stroke={iconStroke} strokeWidth="1.2" fill="none" />
          <ellipse cx="7" cy="13" rx="6" ry="2.5" stroke={iconStroke} strokeWidth="1.2" fill="none" />
        </svg>
      );
    case "triangle":
      return (
        <svg viewBox="0 0 14 12" fill="none" className="h-4 w-4">
          <polygon points="7,1 13,11 1,11" stroke={iconStroke} strokeWidth="1.2" strokeLinejoin="round" />
        </svg>
      );
    case "parallelogram":
      return (
        <svg viewBox="0 0 16 10" fill="none" className="h-4 w-5">
          <polygon points="3,1 15,1 13,9 1,9" stroke={iconStroke} strokeWidth="1.2" strokeLinejoin="round" />
        </svg>
      );
    case "document":
      return (
        <svg viewBox="0 0 12 14" fill="none" className="h-4 w-4">
          <path d="M1 1h7l3 3v9H1V1z" stroke={iconStroke} strokeWidth="1.2" strokeLinejoin="round" fill="none" />
          <path d="M8 1v3h3" stroke={iconStroke} strokeWidth="1.2" strokeLinejoin="round" />
        </svg>
      );
    case "hexagon":
      return (
        <svg viewBox="0 0 16 10" fill="none" className="h-4 w-4">
          <polygon points="4,1 12,1 15,5 12,9 4,9 1,5" stroke={iconStroke} strokeWidth="1.2" strokeLinejoin="round" />
        </svg>
      );
    case "circle":
      return (
        <svg viewBox="0 0 12 12" fill="none" className="h-4 w-4">
          <circle cx="6" cy="6" r="5" stroke={iconStroke} strokeWidth="1.2" strokeDasharray="2 1.5" fill="none" />
        </svg>
      );
    default: // rectangle
      return (
        <svg viewBox="0 0 16 10" fill="none" className="h-4 w-5">
          <rect x="0.5" y="0.5" width="15" height="9" rx="1.5" stroke={iconStroke} strokeWidth="1.2" fill="none" />
        </svg>
      );
  }
}
