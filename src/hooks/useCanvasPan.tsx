/**
 * useCanvasPan — Infinite Viewport Pan & Drag Engine
 *
 * Supports three pan modes:
 * 1. Left-click-drag on empty canvas (the canvas div's onMouseDown calls handleMouseDown)
 * 2. Spacebar + left-click-drag anywhere
 * 3. Middle-click-drag anywhere
 *
 * Node elements call e.stopPropagation() on their own mousedown, so the
 * canvas-level handler only fires when clicking empty space.
 */

import { useState, useEffect, useCallback, useRef } from "react";

export interface UseCanvasPanOptions {
  enableSpacebar?: boolean;
  enableMiddleMouse?: boolean;
  enableLeftClickDrag?: boolean;
  onPanChange?: (panX: number, panY: number) => void;
}

export function useCanvasPan(options: UseCanvasPanOptions = {}) {
  const { enableSpacebar = true, enableMiddleMouse = true, enableLeftClickDrag = true, onPanChange } = options;

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

  const startPan = useCallback((clientX: number, clientY: number) => {
    panStartRef.current = {
      x: clientX,
      y: clientY,
      panX: stateRef.current.panX,
      panY: stateRef.current.panY,
    };
    setIsPanning(true);
    stateRef.current.isPanning = true;
  }, []);

  // Spacebar handler
  useEffect(() => {
    if (!enableSpacebar) return;
    const handleKeyDown = (e: KeyboardEvent) => {
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

  // Global capture-phase mousedown for middle-mouse and spacebar+click
  useEffect(() => {
    const handleCaptureMouseDown = (e: MouseEvent) => {
      const shouldPan =
        (stateRef.current.isSpaceHeld && e.button === 0) ||
        (enableMiddleMouse && e.button === 1);

      if (shouldPan) {
        e.preventDefault();
        e.stopPropagation();
        startPan(e.clientX, e.clientY);
      }
    };

    window.addEventListener("mousedown", handleCaptureMouseDown, true);
    return () => window.removeEventListener("mousedown", handleCaptureMouseDown, true);
  }, [enableMiddleMouse, startPan]);

  // React onMouseDown handler for the canvas div — starts left-click-drag pan.
  // Node elements call e.stopPropagation() so this only fires on empty canvas.
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!enableLeftClickDrag) return;
    if (e.button !== 0) return;
    // Don't pan if spacebar is held (the capture-phase listener handles that)
    if (stateRef.current.isSpaceHeld) return;
    e.preventDefault();
    startPan(e.clientX, e.clientY);
  }, [enableLeftClickDrag, startPan]);

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
