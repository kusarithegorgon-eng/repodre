import type { SVGProps } from "react";

/**
 * Repodre brand logo — faithful reproduction of the "R" lettermark:
 * a rounded chunky "R" in dark slate, with a teal refresh-cycle icon
 * inside the bowl and a teal arrow that exits the leg into a small connector box.
 */
export function RepodreLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      {/* ── Outer "R" leg + bowl stroke ─────────────────────────── */}
      {/*
        The letterform is drawn as a single thick rounded-stroke path that traces:
          stem up → bowl arc → diagonal leg → arrow shaft
        We build it from two pieces so the teal arrow can be a separate element.
      */}

      {/* Vertical stem */}
      <line
        x1="22" y1="96"
        x2="22" y2="20"
        stroke="#2d3748"
        strokeWidth="14"
        strokeLinecap="round"
      />

      {/* Bowl — outer arc: top bar + right curve + mid bar */}
      <path
        d="M22 20 Q22 10 32 10 L62 10 Q84 10 84 34 Q84 58 62 58 L22 58"
        stroke="#2d3748"
        strokeWidth="14"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />

      {/* Inner cutout so bowl is open */}
      <path
        d="M30 20 Q30 18 35 18 L60 18 Q72 18 72 34 Q72 50 60 50 L30 50"
        stroke="#2d3748"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="var(--background, #0a0a0f)"
      />

      {/* Diagonal leg from mid-junction to arrow shaft */}
      <line
        x1="22" y1="58"
        x2="76" y2="96"
        stroke="#2d3748"
        strokeWidth="14"
        strokeLinecap="round"
      />

      {/* ── Teal refresh-cycle icon inside the bowl ─────────────── */}
      {/* Circle arc ~300° */}
      <path
        d="M54 26 A10 10 0 1 1 44.1 33.5"
        stroke="#14b8a6"
        strokeWidth="3.5"
        strokeLinecap="round"
        fill="none"
      />
      {/* Arrow tip on the arc tail */}
      <polygon
        points="44,29 40,36 48,36"
        fill="#14b8a6"
        transform="rotate(-15 44 34)"
      />

      {/* ── Teal arrow extending from the leg tip ───────────────── */}
      {/* Arrow shaft */}
      <line
        x1="80" y1="96"
        x2="102" y2="96"
        stroke="#14b8a6"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      {/* Arrowhead */}
      <polygon points="108,96 100,91 100,101" fill="#14b8a6" />
      {/* Connector box at the tip */}
      <rect
        x="109" y="90"
        width="10" height="12"
        rx="2"
        stroke="#14b8a6"
        strokeWidth="2.5"
        fill="none"
      />
    </svg>
  );
}
