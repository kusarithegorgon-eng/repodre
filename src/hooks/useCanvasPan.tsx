/**
 * useCanvasPan — Infinite Viewport Pan & Drag Engine
 *
 * Uses window capture-phase mousedown so node stopPropagation can't block pan.
 * Hardware-accelerated translate3d for 60fps smooth panning.
 */

import { useState, useEffect, useCallback, useRef } from "react";

export interface UseCanvasPanOptions {
  enableSpacebar?: boolean;
  enableMiddleMouse?: boolean;
  onPanChange?: (panX: number, panY: number) => void;
}

export function useCanvasPan(options: UseCanvasPanOptions = {}) {
  const { enableSpacebar = true, enableMiddleMouse = true, onPanChange } = options;

  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [isPanning, setIsPanning] = useState(false);
  const [isSpaceHeld, setIsSpaceHeld] = useState(false);

  const stateRef = useRef({ panX: 0, panY: 0, isSpaceHeld: false, isPanning: false });
  const panStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  // Keep stateRef in sync with React state
  useEffect(() => { stateRef.current.panX = panX; }, [panX]);
  useEffect(() => { stateRef.current.panY = panY; }, [panY]);
  useEffect(() => { stateRef.current.isSpaceHeld = isSpaceHeld; }, [isSpaceHeld]);
  useEffect(() => { stateRef.current.isPanning = isPanning; }, [isPanning]);

  const cursor = isPanning ? "grabbing" : isSpaceHeld ? "grab" : "default";

  const resetPan = useCallback(() => {
    setPanX(0);
    setPanY(0);
    stateRef.current.panX = 0;
    stateRef.current.panY = 0;
    onPanChange?.(0, 0);
  }, [onPanChange]);

  const setPan = useCallback((x: number, y: number) => {
    setPanX(x);
    setPanY(y);
    onPanChange?.(x, y);
  }, [onPanChange]);

  // Spacebar handler
  useEffect(() => {
    if (!enableSpacebar) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't capture space when user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === "Space" && !e.repeat) {
        e.preventDefault();
        setIsSpaceHeld(true);
        stateRef.current.isSpaceHeld = true;
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        setIsSpaceHeld(false);
        stateRef.current.isSpaceHeld = false;
        if (!panStartRef.current) setIsPanning(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [enableSpacebar]);

  // Global capture-phase mousedown — fires before any React synthetic event
  useEffect(() => {
    const handleCaptureMouseDown = (e: MouseEvent) => {
      const shouldPan =
        (stateRef.current.isSpaceHeld && e.button === 0) ||
        (enableMiddleMouse && e.button === 1);

      if (shouldPan) {
        e.preventDefault();
        e.stopPropagation();
        panStartRef.current = {
          x: e.clientX,
          y: e.clientY,
          panX: stateRef.current.panX,
          panY: stateRef.current.panY,
        };
        setIsPanning(true);
        stateRef.current.isPanning = true;
      }
    };

    // Capture phase ensures this fires before React's bubble-phase handlers
    window.addEventListener("mousedown", handleCaptureMouseDown, true);
    return () => window.removeEventListener("mousedown", handleCaptureMouseDown, true);
  }, [enableMiddleMouse]);

  // Global mousemove + mouseup for active panning
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!stateRef.current.isPanning || !panStartRef.current) return;
      const dx = e.clientX - panStartRef.current.x;
      const dy = e.clientY - panStartRef.current.y;
      const nx = panStartRef.current.panX + dx;
      const ny = panStartRef.current.panY + dy;
      setPanX(nx);
      setPanY(ny);
      stateRef.current.panX = nx;
      stateRef.current.panY = ny;
      onPanChange?.(nx, ny);
    };

    const handleMouseUp = () => {
      if (!stateRef.current.isPanning) return;
      panStartRef.current = null;
      setIsPanning(false);
      stateRef.current.isPanning = false;
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [onPanChange]);

  // Expose a no-op React handler for backwards-compat (canvas div's onMouseDown)
  const handleMouseDown = useCallback((_e: React.MouseEvent) => {
    // Actual pan handling is via window capture-phase listener above
  }, []);

  // Force body cursor when panning so it shows over all child elements
  useEffect(() => {
    if (isPanning) {
      document.body.style.cursor = "grabbing";
    } else if (isSpaceHeld) {
      document.body.style.cursor = "grab";
    } else {
      document.body.style.cursor = "";
    }
    return () => { document.body.style.cursor = ""; };
  }, [isPanning, isSpaceHeld]);

  return {
    panX,
    panY,
    isPanning,
    isSpaceHeld,
    cursor,
    handleMouseDown,
    resetPan,
    setPan,
    transform: `translate3d(${panX}px, ${panY}px, 0)`,
  };
}

export function RecenterButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title="Recenter workspace (0, 0)"
      className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition-all hover:text-foreground hover:border-teal"
    >
      <svg viewBox="0 0 16 16" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.5">
        <circle cx="8" cy="8" r="3" />
        <path d="M8 1v2M8 13v2M1 8h2M13 8h2" />
      </svg>
    </button>
  );
}
