/**
 * useCanvasPan — Infinite Viewport Pan & Drag Engine
 *
 * Tracks mouse coordinate states for spacebar/middle-mouse drag panning.
 * Uses hardware-accelerated CSS transform (translate3d) for smooth 60fps.
 */

import { useState, useEffect, useCallback, useRef } from "react";

export interface CanvasPanState {
  panX: number;
  panY: number;
  isPanning: boolean;
  cursor: "grab" | "grabbing" | "default";
}

export interface UseCanvasPanOptions {
  /** Enable spacebar panning */
  enableSpacebar?: boolean;
  /** Enable middle-mouse button panning */
  enableMiddleMouse?: boolean;
  /** Callback when pan changes */
  onPanChange?: (panX: number, panY: number) => void;
}

export function useCanvasPan(options: UseCanvasPanOptions = {}) {
  const { enableSpacebar = true, enableMiddleMouse = true, onPanChange } = options;

  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [isPanning, setIsPanning] = useState(false);
  const [isSpaceHeld, setIsSpaceHeld] = useState(false);

  const panStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  const cursor: CanvasPanState["cursor"] = isPanning
    ? "grabbing"
    : isSpaceHeld
    ? "grab"
    : "default";

  // Reset pan to origin
  const resetPan = useCallback(() => {
    setPanX(0);
    setPanY(0);
    onPanChange?.(0, 0);
  }, [onPanChange]);

  // Set pan to specific position
  const setPan = useCallback((x: number, y: number) => {
    setPanX(x);
    setPanY(y);
    onPanChange?.(x, y);
  }, [onPanChange]);

  // Spacebar handler
  useEffect(() => {
    if (!enableSpacebar) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" && !e.repeat) {
        e.preventDefault();
        setIsSpaceHeld(true);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        setIsSpaceHeld(false);
        if (!panStartRef.current) {
          setIsPanning(false);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [enableSpacebar]);

  // Mouse handlers for panning
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Spacebar + left click OR middle mouse button
      const shouldPan =
        (isSpaceHeld && e.button === 0) || (enableMiddleMouse && e.button === 1);

      if (shouldPan) {
        e.preventDefault();
        e.stopPropagation();
        panStartRef.current = {
          x: e.clientX,
          y: e.clientY,
          panX,
          panY,
        };
        setIsPanning(true);
      }
    },
    [isSpaceHeld, enableMiddleMouse, panX, panY]
  );

  // Global mouse move/up handlers
  useEffect(() => {
    if (!isPanning || !panStartRef.current) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!panStartRef.current) return;

      const deltaX = e.clientX - panStartRef.current.x;
      const deltaY = e.clientY - panStartRef.current.y;

      const newPanX = panStartRef.current.panX + deltaX;
      const newPanY = panStartRef.current.panY + deltaY;

      setPanX(newPanX);
      setPanY(newPanY);
      onPanChange?.(newPanX, newPanY);
    };

    const handleMouseUp = () => {
      panStartRef.current = null;
      setIsPanning(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isPanning, onPanChange]);

  return {
    panX,
    panY,
    isPanning,
    isSpaceHeld,
    cursor,
    handleMouseDown,
    resetPan,
    setPan,
    /** Hardware-accelerated transform string */
    transform: `translate3d(${panX}px, ${panY}px, 0)`,
  };
}

/**
 * Recenter Button Component
 */
export function RecenterButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title="Recenter workspace (0, 0)"
      className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition-all hover:text-foreground hover:border-teal"
    >
      <svg
        viewBox="0 0 16 16"
        fill="none"
        className="h-4 w-4"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <circle cx="8" cy="8" r="3" />
        <path d="M8 1v2M8 13v2M1 8h2M13 8h2" />
      </svg>
    </button>
  );
}

/**
 * Canvas wrapper that applies the pan transform.
 */
export function CanvasPanWrapper({
  panX,
  panY,
  children,
  scale = 1,
  className = "",
}: {
  panX: number;
  panY: number;
  children: React.ReactNode;
  scale?: number;
  className?: string;
}) {
  return (
    <div
      className={`absolute inset-0 overflow-hidden ${className}`}
      style={{ transformOrigin: "0 0" }}
    >
      <div
        className="h-full w-full"
        style={{
          transform: `translate3d(${panX}px, ${panY}px, 0) scale(${scale})`,
          willChange: "transform",
        }}
      >
        {children}
      </div>
    </div>
  );
}
