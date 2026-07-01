import type { SVGProps } from "react";

export function RepodreLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <defs>
        <linearGradient id="logoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#14b8a6" />
          <stop offset="100%" stopColor="#3b82f6" />
        </linearGradient>
      </defs>
      <rect
        x="2"
        y="2"
        width="28"
        height="28"
        rx="6"
        stroke="url(#logoGrad)"
        strokeWidth="2"
        fill="none"
      />
      <path
        d="M8 16h16M16 8v16"
        stroke="url(#logoGrad)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="8" cy="8" r="2" fill="#22c55e" />
      <circle cx="24" cy="8" r="2" fill="#a855f7" />
      <circle cx="8" cy="24" r="2" fill="#3b82f6" />
      <circle cx="24" cy="24" r="2" fill="#14b8a6" />
    </svg>
  );
}
