import { useState, useRef, type ReactNode } from "react";

interface TooltipProps {
  content: string;
  children: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  delay?: number;
}

export function Tooltip({ content, children, side = "top", delay = 400 }: TooltipProps) {
  const [show, setShow] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleEnter = () => {
    timer.current = setTimeout(() => setShow(true), delay);
  };
  const handleLeave = () => {
    if (timer.current) clearTimeout(timer.current);
    setShow(false);
  };

  const positionClasses: Record<string, string> = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
    left: "right-full mr-2 top-1/2 -translate-y-1/2",
    right: "left-full ml-2 top-1/2 -translate-y-1/2",
  };

  const arrowClasses: Record<string, string> = {
    top: "top-full left-1/2 -translate-x-1/2 border-t-4 border-x-4 border-x-transparent border-t-popover",
    bottom: "bottom-full left-1/2 -translate-x-1/2 border-b-4 border-x-4 border-x-transparent border-b-popover",
    left: "left-full top-1/2 -translate-y-1/2 border-l-4 border-y-4 border-y-transparent border-l-popover",
    right: "right-full top-1/2 -translate-y-1/2 border-r-4 border-y-4 border-y-transparent border-r-popover",
  };

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      onFocus={handleEnter}
      onBlur={handleLeave}
    >
      {children}
      {show && content && (
        <div
          className={`pointer-events-none absolute z-[200] whitespace-nowrap rounded-md bg-popover px-3 py-1.5 text-xs font-medium text-popover-foreground shadow-lg border border-border ${positionClasses[side]}`}
          style={{ animation: "fadeIn 150ms ease" }}
          role="tooltip"
        >
          {content}
          <span className={`absolute border-4 ${arrowClasses[side]}`} aria-hidden="true" />
        </div>
      )}
    </div>
  );
}
