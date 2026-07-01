import { useState, useCallback, useRef, useEffect } from "react";

interface Position {
  x: number;
  y: number;
}

interface UseDraggableOptions {
  initialPosition: Position;
  onDragStart?: (position: Position) => void;
  onDragMove?: (position: Position) => void;
  onDragEnd?: (position: Position) => void;
  bounds?: {
    left?: number;
    right?: number;
    top?: number;
    bottom?: number;
  };
  scale?: number;
}

interface UseDraggableReturn {
  position: Position;
  isDragging: boolean;
  handleMouseDown: (e: React.MouseEvent) => void;
  handleTouchStart: (e: React.TouchEvent) => void;
}

export function useDraggable({
  initialPosition,
  onDragStart,
  onDragMove,
  onDragEnd,
  bounds,
  scale = 1,
}: UseDraggableOptions): UseDraggableReturn {
  const [position, setPosition] = useState<Position>(initialPosition);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const animationRef = useRef<number | null>(null);
  const pendingPosition = useRef<Position | null>(null);

  // Clamp position to bounds
  const clampPosition = useCallback(
    (pos: Position): Position => {
      let x = pos.x;
      let y = pos.y;

      if (bounds) {
        if (bounds.left !== undefined) x = Math.max(bounds.left, x);
        if (bounds.right !== undefined) x = Math.min(bounds.right, x);
        if (bounds.top !== undefined) y = Math.max(bounds.top, y);
        if (bounds.bottom !== undefined) y = Math.min(bounds.bottom, y);
      }

      return { x, y };
    },
    [bounds]
  );

  // Animation loop for smooth updates
  const updatePosition = useCallback(() => {
    if (pendingPosition.current) {
      setPosition(pendingPosition.current);
      onDragMove?.(pendingPosition.current);
      pendingPosition.current = null;
    }
    animationRef.current = null;
  }, [onDragMove]);

  const scheduleUpdate = useCallback(
    (newPos: Position) => {
      pendingPosition.current = clampPosition(newPos);
      if (!animationRef.current) {
        animationRef.current = requestAnimationFrame(updatePosition);
      }
    },
    [clampPosition, updatePosition]
  );

  // Mouse handlers
  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!dragRef.current) return;

      const dx = (e.clientX - dragRef.current.startX) / scale;
      const dy = (e.clientY - dragRef.current.startY) / scale;

      scheduleUpdate({
        x: dragRef.current.offsetX + dx,
        y: dragRef.current.offsetY + dy,
      });
    },
    [scale, scheduleUpdate]
  );

  const handleMouseUp = useCallback(() => {
    if (!dragRef.current) return;

    const finalPos = clampPosition(position);
    setPosition(finalPos);
    setIsDragging(false);
    onDragEnd?.(finalPos);
    dragRef.current = null;

    window.removeEventListener("mousemove", handleMouseMove);
    window.removeEventListener("mouseup", handleMouseUp);
  }, [position, clampPosition, onDragEnd, handleMouseMove]);

  // Touch handlers
  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (!dragRef.current) return;

      const touch = e.touches[0];
      const dx = (touch.clientX - dragRef.current.startX) / scale;
      const dy = (touch.clientY - dragRef.current.startY) / scale;

      scheduleUpdate({
        x: dragRef.current.offsetX + dx,
        y: dragRef.current.offsetY + dy,
      });
    },
    [scale, scheduleUpdate]
  );

  const handleTouchEnd = useCallback(() => {
    if (!dragRef.current) return;

    const finalPos = clampPosition(position);
    setPosition(finalPos);
    setIsDragging(false);
    onDragEnd?.(finalPos);
    dragRef.current = null;

    window.removeEventListener("touchmove", handleTouchMove);
    window.removeEventListener("touchend", handleTouchEnd);
  }, [position, clampPosition, onDragEnd, handleTouchMove]);

  // Start drag
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        offsetX: position.x,
        offsetY: position.y,
      };

      setIsDragging(true);
      onDragStart?.(position);

      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    },
    [position, onDragStart, handleMouseMove, handleMouseUp]
  );

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      const touch = e.touches[0];
      dragRef.current = {
        startX: touch.clientX,
        startY: touch.clientY,
        offsetX: position.x,
        offsetY: position.y,
      };

      setIsDragging(true);
      onDragStart?.(position);

      window.addEventListener("touchmove", handleTouchMove, { passive: false });
      window.addEventListener("touchend", handleTouchEnd);
    },
    [position, onDragStart, handleTouchMove, handleTouchEnd]
  );

  // Cleanup
  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
    };
  }, [handleMouseMove, handleMouseUp, handleTouchMove, handleTouchEnd]);

  // Update position when initialPosition changes externally
  useEffect(() => {
    if (!isDragging) {
      setPosition(initialPosition);
    }
  }, [initialPosition, isDragging]);

  return {
    position,
    isDragging,
    handleMouseDown,
    handleTouchStart,
  };
}
