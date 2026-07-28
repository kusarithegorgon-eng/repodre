/**
 * useCanvasPan — Infinite Viewport Pan & Drag Engine
 *
 * Uses window capture-phase mousedown so node stopPropagation can't block pan.
 * Hardware-accelerated translate3d for 60fps smooth panning.
 *
 * Touch support:
 *   - Single finger: pan the canvas
 *   - Two fingers: pinch-to-zoom (calls onZoomChange) + two-finger pan
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
  /** The canvas viewport element ref (for attaching touch listeners). */
  canvasRef?: React.RefObject<HTMLElement | null>;
}

export function useCanvasPan(options: UseCanvasPanOptions = {}) {
  const {
    enableSpacebar = true,
    enableMiddleMouse = true,
    onPanChange,
    onZoomChange,
    zoom = 100,
    canvasRef,
  } = options;

  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [isPanning, setIsPanning] = useState(false);
  const [isSpaceHeld, setIsSpaceHeld] = useState(false);

  const stateRef = useRef({ panX: 0, panY: 0, isSpaceHeld: false, isPanning: false, zoom: 100 });
  const panStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  // Touch state
  const touchStartRef = useRef<{
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

  // ─── Mouse: capture-phase mousedown ──────────────────────────────────────
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

    window.addEventListener("mousedown", handleCaptureMouseDown, true);
    return () => window.removeEventListener("mousedown", handleCaptureMouseDown, true);
  }, [enableMiddleMouse]);

  // ─── Mouse: mousemove + mouseup ──────────────────────────────────────────
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

  // ─── Touch: single-finger pan + pinch-to-zoom ────────────────────────────
  useEffect(() => {
    const el = canvasRef?.current;
    if (!el) return;

    const getTouchDistance = (t1: Touch, t2: Touch): number => {
      return Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
    };

    const handleTouchStart = (e: TouchEvent) => {
      // Don't intercept touches on form elements
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;

      if (e.touches.length === 1) {
        // Single finger — start panning
        const t = e.touches[0];
        panStartRef.current = {
          x: t.clientX,
          y: t.clientY,
          panX: stateRef.current.panX,
          panY: stateRef.current.panY,
        };
        setIsPanning(true);
        stateRef.current.isPanning = true;
      } else if (e.touches.length === 2) {
        // Two fingers — start pinch-to-zoom + two-finger pan
        panStartRef.current = null; // cancel single-finger pan
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        touchStartRef.current = {
          panX: stateRef.current.panX,
          panY: stateRef.current.panY,
          distance: getTouchDistance(t1, t2),
          centerX: (t1.clientX + t2.clientX) / 2,
          centerY: (t1.clientY + t2.clientY) / 2,
          zoom: stateRef.current.zoom,
        };
        setIsPanning(true);
        stateRef.current.isPanning = true;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 1 && panStartRef.current) {
        // Single-finger pan
        e.preventDefault();
        const t = e.touches[0];
        const dx = t.clientX - panStartRef.current.x;
        const dy = t.clientY - panStartRef.current.y;
        const nx = panStartRef.current.panX + dx;
        const ny = panStartRef.current.panY + dy;
        setPanX(nx);
        setPanY(ny);
        stateRef.current.panX = nx;
        stateRef.current.panY = ny;
        onPanChange?.(nx, ny);
      } else if (e.touches.length === 2 && touchStartRef.current) {
        // Pinch-to-zoom + two-finger pan
        e.preventDefault();
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const start = touchStartRef.current;

        // Zoom from pinch distance ratio
        const currentDistance = getTouchDistance(t1, t2);
        const distanceRatio = currentDistance / start.distance;
        const newZoom = Math.max(25, Math.min(200, Math.round(start.zoom * distanceRatio)));

        // Pan from centroid movement
        const currentCenterX = (t1.clientX + t2.clientX) / 2;
        const currentCenterY = (t1.clientY + t2.clientY) / 2;
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

    const handleTouchEnd = (e: TouchEvent) => {
      if (e.touches.length === 0) {
        panStartRef.current = null;
        touchStartRef.current = null;
        setIsPanning(false);
        stateRef.current.isPanning = false;
      } else if (e.touches.length === 1 && touchStartRef.current) {
        // Transition from pinch back to single-finger pan
        const t = e.touches[0];
        panStartRef.current = {
          x: t.clientX,
          y: t.clientY,
          panX: stateRef.current.panX,
          panY: stateRef.current.panY,
        };
        touchStartRef.current = null;
      }
    };

    el.addEventListener("touchstart", handleTouchStart, { passive: false });
    el.addEventListener("touchmove", handleTouchMove, { passive: false });
    el.addEventListener("touchend", handleTouchEnd);
    el.addEventListener("touchcancel", handleTouchEnd);

    return () => {
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("touchmove", handleTouchMove);
      el.removeEventListener("touchend", handleTouchEnd);
      el.removeEventListener("touchcancel", handleTouchEnd);
    };
  }, [canvasRef, onPanChange, onZoomChange]);

  // Expose a no-op React handler for backwards-compat (canvas div's onMouseDown)
  const handleMouseDown = useCallback((_e: React.MouseEvent) => {}, []);

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
