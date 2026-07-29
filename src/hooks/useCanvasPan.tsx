/**
 * useCanvasPan — Infinite Viewport Pan & Drag Engine
 *
 * Uses unified Pointer Events for both mouse and touch interactions:
 *   - Mouse left-click drag on empty canvas → pan
 *   - Single touch drag → pan
 *   - Two-finger pinch → zoom (calls onZoomChange) + two-finger pan
 *   - Spacebar + left-click → pan (via window capture-phase handler)
 *   - Middle mouse → pan (via window capture-phase handler)
 *
 * Hardware-accelerated translate3d for 60fps smooth panning.
 */

import { useState, useEffect, useCallback, useRef } from "react";

export interface UseCanvasPanOptions {
  enableSpacebar?: boolean;
  enableMiddleMouse?: boolean;
  onPanChange?: (panX: number, panY: number) => void;
  /** Called with a new zoom percentage (e.g. 100, 150) during pinch-to-zoom. */
  onZoomChange?: (zoom: number) => void;
  /** Current zoom percentage so pinch math can scale deltas correctly. */
  zoom?: number;
  /** The canvas viewport element ref (unused now, kept for API compat). */
  canvasRef?: React.RefObject<HTMLElement | null>;
}

export function useCanvasPan(options: UseCanvasPanOptions = {}) {
  const {
    enableSpacebar = true,
    enableMiddleMouse = true,
    onPanChange,
    onZoomChange,
    zoom = 100,
  } = options;

  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [isPanning, setIsPanning] = useState(false);
  const [isSpaceHeld, setIsSpaceHeld] = useState(false);

  const stateRef = useRef({ panX: 0, panY: 0, isSpaceHeld: false, isPanning: false, zoom: 100 });
  const panStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  // Active pointers for multi-touch (pinch-to-zoom)
  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchStartRef = useRef<{
    panX: number;
    panY: number;
    distance: number;
    centerX: number;
    centerY: number;
    zoom: number;
  } | null>(null);

  // Keep stateRef in sync with React state
  useEffect(() => { stateRef.current.panX = panX; }, [panX]);
  useEffect(() => { stateRef.current.panY = panY; }, [panY]);
  useEffect(() => { stateRef.current.isSpaceHeld = isSpaceHeld; }, [isSpaceHeld]);
  useEffect(() => { stateRef.current.isPanning = isPanning; }, [isPanning]);
  useEffect(() => { stateRef.current.zoom = zoom; }, [zoom]);

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

  // ─── Spacebar handler ────────────────────────────────────────────────────
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

  // ─── Window capture-phase pointerdown (spacebar+left-click, middle mouse) ─
  useEffect(() => {
    const handleCapturePointerDown = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;

      const shouldPan =
        (stateRef.current.isSpaceHeld && e.button === 0) ||
        (enableMiddleMouse && e.button === 1);

      if (!shouldPan) return;

      e.preventDefault();
      e.stopPropagation();

      activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      panStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        panX: stateRef.current.panX,
        panY: stateRef.current.panY,
      };
      setIsPanning(true);
      stateRef.current.isPanning = true;
    };

    window.addEventListener("pointerdown", handleCapturePointerDown, true);
    return () => window.removeEventListener("pointerdown", handleCapturePointerDown, true);
  }, [enableMiddleMouse]);

  // ─── Window pointermove + pointerup (shared by all pointer types) ─────────
  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (!activePointersRef.current.has(e.pointerId)) return;
      activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (activePointersRef.current.size === 1 && panStartRef.current) {
        // Single-pointer pan
        const dx = e.clientX - panStartRef.current.x;
        const dy = e.clientY - panStartRef.current.y;
        const nx = panStartRef.current.panX + dx;
        const ny = panStartRef.current.panY + dy;
        setPanX(nx);
        setPanY(ny);
        stateRef.current.panX = nx;
        stateRef.current.panY = ny;
        onPanChange?.(nx, ny);
      } else if (activePointersRef.current.size === 2 && pinchStartRef.current) {
        // Pinch-to-zoom + two-finger pan
        const pointers = Array.from(activePointersRef.current.values());
        const start = pinchStartRef.current;
        const currentDistance = Math.hypot(pointers[0].x - pointers[1].x, pointers[0].y - pointers[1].y);
        const distanceRatio = currentDistance / start.distance;
        const newZoom = Math.max(25, Math.min(200, Math.round(start.zoom * distanceRatio)));
        const currentCenterX = (pointers[0].x + pointers[1].x) / 2;
        const currentCenterY = (pointers[0].y + pointers[1].y) / 2;
        const dx = currentCenterX - start.centerX;
        const dy = currentCenterY - start.centerY;
        const nx = start.panX + dx;
        const ny = start.panY + dy;
        setPanX(nx);
        setPanY(ny);
        stateRef.current.panX = nx;
        stateRef.current.panY = ny;
        onPanChange?.(nx, ny);
        if (onZoomChange && newZoom !== stateRef.current.zoom) {
          onZoomChange(newZoom);
        }
      }
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (!activePointersRef.current.has(e.pointerId)) return;
      activePointersRef.current.delete(e.pointerId);

      if (activePointersRef.current.size === 0) {
        panStartRef.current = null;
        pinchStartRef.current = null;
        setIsPanning(false);
        stateRef.current.isPanning = false;
      } else if (activePointersRef.current.size === 1 && pinchStartRef.current) {
        // Transition from pinch back to single-pointer pan
        const [remaining] = Array.from(activePointersRef.current.entries());
        panStartRef.current = {
          x: remaining[1].x,
          y: remaining[1].y,
          panX: stateRef.current.panX,
          panY: stateRef.current.panY,
        };
        pinchStartRef.current = null;
      }
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [onPanChange, onZoomChange]);

  // ─── React pointer handler for the canvas viewport container ─────────────
  // Attach this to the canvas div via onPointerDown. It handles:
  //   - Mouse left-click on empty canvas background → pan
  //   - Single touch → pan
  //   - Two-finger touch → pinch-to-zoom
  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // Don't intercept on form elements
    const target = e.target as HTMLElement;
    if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;

    if (e.pointerType === "mouse") {
      // Only pan on left-click (button 0)
      if (e.button !== 0) return;
      // Skip if spacebar is held — the window capture handler manages that case
      if (stateRef.current.isSpaceHeld) return;
      // Only pan when clicking on the canvas background, not on a node or
      // other interactive child element. The canvas div itself and the
      // inner content wrapper (marked with data-canvas-content) qualify.
      if (target !== e.currentTarget && !target.hasAttribute("data-canvas-content")) return;
    }

    e.preventDefault();
    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointersRef.current.size === 1) {
      // Single pointer — start panning
      panStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        panX: stateRef.current.panX,
        panY: stateRef.current.panY,
      };
      setIsPanning(true);
      stateRef.current.isPanning = true;
    } else if (activePointersRef.current.size === 2) {
      // Two pointers — start pinch-to-zoom + two-finger pan
      panStartRef.current = null;
      const pointers = Array.from(activePointersRef.current.values());
      const dist = Math.hypot(pointers[0].x - pointers[1].x, pointers[0].y - pointers[1].y);
      pinchStartRef.current = {
        panX: stateRef.current.panX,
        panY: stateRef.current.panY,
        distance: dist,
        centerX: (pointers[0].x + pointers[1].x) / 2,
        centerY: (pointers[0].y + pointers[1].y) / 2,
        zoom: stateRef.current.zoom,
      };
    }
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
    handlePointerDown,
    resetPan,
    setPan,
    transform: `translate3d(${panX}px, ${panY}px, 0)`,
  };
}
