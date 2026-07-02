/**
 * NodeShapeSVG
 *
 * Renders the visual boundary of a canvas node as an absolutely-positioned
 * SVG layer. Each shape variant uses a precise SVG path so that:
 *   – connector cables can be anchored to the true perimeter via
 *     the geometry engine's polygon intersection math, and
 *   – text content is safely clipped within the inscribed safe zone.
 *
 * The SVG fills the node's bounding rect (NODE_W × NODE_H).
 * For cylinder the SVG is taller by CYLINDER_CAP to draw the 3D caps.
 */

import type { Shape } from "@/lib/canvas-geometry";
import { CYLINDER_CAP } from "@/lib/canvas-geometry";

interface NodeShapeSVGProps {
  shape: Shape;
  width: number;
  height: number;
  color: string;
  glow: string;
  selected: boolean;
  /** extra CSS class for the wrapping <svg> element */
  className?: string;
}

export function NodeShapeSVG({
  shape,
  width,
  height,
  color,
  glow,
  selected,
  className = "",
}: NodeShapeSVGProps) {
  const strokeW = 2;
  const glowShadow = selected
    ? `drop-shadow(0 0 10px ${color}) drop-shadow(0 0 4px ${glow})`
    : `drop-shadow(0 0 6px ${glow})`;

  const commonFill = "var(--surface-raised)";

  switch (shape) {
    // ── Pill (stadium) ────────────────────────────────────────────────────
    case "pill":
      return (
        <svg
          className={`absolute inset-0 ${className}`}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          fill="none"
          style={{ filter: glowShadow, overflow: "visible" }}
        >
          <rect
            x={strokeW / 2}
            y={strokeW / 2}
            width={width - strokeW}
            height={height - strokeW}
            rx={height / 2}
            fill={commonFill}
            stroke={color}
            strokeWidth={strokeW}
          />
        </svg>
      );

    // ── Diamond ───────────────────────────────────────────────────────────
    case "diamond": {
      const mx = width / 2;
      const my = height / 2;
      const pts = `${mx},${strokeW / 2} ${width - strokeW / 2},${my} ${mx},${height - strokeW / 2} ${strokeW / 2},${my}`;
      return (
        <svg
          className={`absolute inset-0 ${className}`}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          fill="none"
          style={{ filter: glowShadow, overflow: "visible" }}
        >
          <polygon
            points={pts}
            fill={commonFill}
            stroke={color}
            strokeWidth={strokeW}
            strokeLinejoin="round"
          />
        </svg>
      );
    }

    // ── Cylinder / Database ───────────────────────────────────────────────
    case "cylinder": {
      const totalH = height + CYLINDER_CAP;
      const rx = width / 2 - strokeW;
      const ry = CYLINDER_CAP / 2;
      const bodyTop = ry; // top of rectangular body starts at ellipse centre
      const bodyBot = totalH - ry;
      return (
        <svg
          className={`absolute ${className}`}
          style={{
            top: -CYLINDER_CAP / 2,
            left: 0,
            filter: glowShadow,
            overflow: "visible",
          }}
          width={width}
          height={totalH}
          viewBox={`0 0 ${width} ${totalH}`}
          fill="none"
        >
          {/* Body rectangle */}
          <rect
            x={strokeW}
            y={bodyTop}
            width={width - strokeW * 2}
            height={bodyBot - bodyTop}
            fill={commonFill}
            stroke={color}
            strokeWidth={strokeW}
          />
          {/* Bottom ellipse (behind label but provides 3D depth) */}
          <ellipse
            cx={width / 2}
            cy={bodyBot}
            rx={rx}
            ry={ry}
            fill={commonFill}
            stroke={color}
            strokeWidth={strokeW}
          />
          {/* Top ellipse cap (foreground) */}
          <ellipse
            cx={width / 2}
            cy={bodyTop}
            rx={rx}
            ry={ry}
            fill={`color-mix(in oklab, ${color} 18%, var(--surface-raised))`}
            stroke={color}
            strokeWidth={strokeW}
          />
        </svg>
      );
    }

    // ── Triangle ──────────────────────────────────────────────────────────
    case "triangle": {
      const half = strokeW / 2;
      const pts = `${width / 2},${half} ${width - half},${height - half} ${half},${height - half}`;
      return (
        <svg
          className={`absolute inset-0 ${className}`}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          fill="none"
          style={{ filter: glowShadow, overflow: "visible" }}
        >
          <polygon
            points={pts}
            fill={commonFill}
            stroke={color}
            strokeWidth={strokeW}
            strokeLinejoin="round"
          />
        </svg>
      );
    }

    // ── Parallelogram ─────────────────────────────────────────────────────
    case "parallelogram": {
      const skew = width * 0.18;
      const half = strokeW / 2;
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
          style={{ filter: glowShadow, overflow: "visible" }}
        >
          <polygon
            points={pts}
            fill={commonFill}
            stroke={color}
            strokeWidth={strokeW}
            strokeLinejoin="round"
          />
        </svg>
      );
    }

    // ── Document (rectangle with folded corner) ───────────────────────────
    case "document": {
      const fold = 22; // size of the folded corner triangle
      const half = strokeW / 2;
      const r = 6; // corner radius for non-folded corners
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
      // Folded corner accent
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
          style={{ filter: glowShadow, overflow: "visible" }}
        >
          <path d={d} fill={commonFill} stroke={color} strokeWidth={strokeW} strokeLinejoin="round" />
          <path d={foldPath} stroke={color} strokeWidth={strokeW} strokeLinejoin="round" opacity={0.7} />
        </svg>
      );
    }

    // ── Hexagon (Role Gateway Switch) ───────────────────────────────────────
    case "hexagon": {
      const hw = width / 2;
      const hh = height / 2;
      const inset = width * 0.25; // 25% inset for the angled portions
      const half = strokeW / 2;
      // Vertices go clockwise from top-left
      const pts = [
        `${hw - inset + half},${half}`,        // top-left
        `${hw + inset - half},${half}`,        // top-right
        `${width - half},${hh}`,               // right vertex
        `${hw + inset - half},${height - half}`, // bottom-right
        `${hw - inset + half},${height - half}`, // bottom-left
        `${half},${hh}`,                       // left vertex
      ].join(" ");
      return (
        <svg
          className={`absolute inset-0 ${className}`}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          fill="none"
          style={{ filter: glowShadow, overflow: "visible" }}
        >
          <polygon
            points={pts}
            fill={commonFill}
            stroke={color}
            strokeWidth={strokeW}
            strokeLinejoin="round"
          />
        </svg>
      );
    }

    // ── Rectangle (default) ───────────────────────────────────────────────
    default:
      return (
        <svg
          className={`absolute inset-0 ${className}`}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          fill="none"
          style={{ filter: glowShadow, overflow: "visible" }}
        >
          <rect
            x={strokeW / 2}
            y={strokeW / 2}
            width={width - strokeW}
            height={height - strokeW}
            rx={8}
            fill={commonFill}
            stroke={color}
            strokeWidth={strokeW}
          />
        </svg>
      );
  }
}

// ── Shape icon SVGs for the toolbar ────────────────────────────────────────

/** Compact 16×16 shape preview icons for the toolbar palette. */
export function ShapeIcon({ shape }: { shape: Shape }) {
  switch (shape) {
    case "pill":
      return (
        <svg viewBox="0 0 16 8" fill="none" className="h-4 w-7">
          <rect x="0.5" y="0.5" width="15" height="7" rx="3.5" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      );
    case "diamond":
      return (
        <svg viewBox="0 0 14 14" fill="none" className="h-4 w-4">
          <polygon points="7,1 13,7 7,13 1,7" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
        </svg>
      );
    case "cylinder":
      return (
        <svg viewBox="0 0 14 16" fill="none" className="h-4 w-4">
          <rect x="1" y="3" width="12" height="10" stroke="currentColor" strokeWidth="1.2" />
          <ellipse cx="7" cy="3" rx="6" ry="2.5" stroke="currentColor" strokeWidth="1.2" />
          <ellipse cx="7" cy="13" rx="6" ry="2.5" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      );
    case "triangle":
      return (
        <svg viewBox="0 0 14 12" fill="none" className="h-4 w-4">
          <polygon points="7,1 13,11 1,11" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
        </svg>
      );
    case "parallelogram":
      return (
        <svg viewBox="0 0 16 10" fill="none" className="h-4 w-5">
          <polygon points="3,1 15,1 13,9 1,9" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
        </svg>
      );
    case "document":
      return (
        <svg viewBox="0 0 12 14" fill="none" className="h-4 w-4">
          <path d="M1 1h7l3 3v9H1V1z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
          <path d="M8 1v3h3" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
        </svg>
      );
    case "hexagon":
      return (
        <svg viewBox="0 0 16 10" fill="none" className="h-4 w-4">
          <polygon points="4,1 12,1 15,5 12,9 4,9 1,5" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
        </svg>
      );
    default: // rectangle
      return (
        <svg viewBox="0 0 16 10" fill="none" className="h-4 w-5">
          <rect x="0.5" y="0.5" width="15" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      );
  }
}
