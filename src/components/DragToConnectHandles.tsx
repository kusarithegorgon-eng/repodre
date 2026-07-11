/**
 * DragToConnectHandles — Interactive Drag-to-Connect Ports
 *
 * Hidden by default, appearing as small blue dots on mouse-hover at
 * the cardinal bounds (Top, Right, Bottom, Left) of every canvas shape.
 *
 * Features:
 *   - Mouse-drag pulls out a live SVG cubic-bezier cursor tracking line
 *   - Vector snapping: release over any port of another node registers a new edge
 */

import { useState, useCallback, useEffect } from "react";
import type { Point, HandleSegment, Shape } from "@/lib/canvas-geometry";
import { anchorHandles, NODE_W, NODE_H } from "@/lib/canvas-geometry";

export interface DragToConnectHandleProps {
  shape: Shape;
  x: number;
  y: number;
  w?: number;
  h?: number;
  accentColor: string;
  accentGlow: string;
  visible: boolean;
  onStartDrag: (handleId: HandleSegment, startPos: Point) => void;
}

const HANDLE_SIZE = 8;
const HANDLE_SIZE_HOVER = 12;

export function DragToConnectHandle({
  shape,
  x,
  y,
  w = NODE_W,
  h = NODE_H,
  accentColor,
  accentGlow,
  visible,
  onStartDrag,
}: DragToConnectHandleProps) {
  const [isHovered, setIsHovered] = useState(false);
  const handles = anchorHandles({ shape, x: 0, y: 0, w, h });

  if (!visible) return null;

  const cx = w / 2;
  const cy = h / 2;

  return (
    <div className="absolute inset-0 pointer-events-none">
      {handles.map((h) => {
        const portX = cx + (h.x - cx);
        const portY = cy + (h.y - cy);

        return (
          <div
            key={h.id}
            className="connector-port pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 transition-all duration-150"
            style={{
              left: portX,
              top: portY,
              width: isHovered ? HANDLE_SIZE_HOVER : HANDLE_SIZE,
              height: isHovered ? HANDLE_SIZE_HOVER : HANDLE_SIZE,
              borderRadius: "50%",
              background: isHovered ? accentColor : "var(--surface)",
              border: `2px solid ${accentColor}`,
              boxShadow: isHovered ? `0 0 10px 2px ${accentGlow}` : "none",
              cursor: "crosshair",
              zIndex: 30,
            }}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();

              const canvasPos = {
                x: x + portX,
                y: y + portY,
              };

              onStartDrag(h.id, canvasPos);
            }}
          />
        );
      })}
    </div>
  );
}

// ─── Live Edge Drawing Layer ─────────────────────────────────────────────────

export interface LiveEdgeDrawingProps {
  isActive: boolean;
  startNode: { id: string; shape: Shape; x: number; y: number; w?: number; h?: number } | null;
  startHandle: HandleSegment | null;
  currentMousePos: Point | null;
  zoom: number;
  accentColor: string;
}

export function LiveEdgeDrawing({
  isActive,
  startNode,
  startHandle,
  currentMousePos,
  zoom,
  accentColor,
}: LiveEdgeDrawingProps) {
  if (!isActive || !startNode || !currentMousePos || !startHandle) return null;

  const handles = anchorHandles({
    shape: startNode.shape,
    x: 0,
    y: 0,
    w: startNode.w ?? NODE_W,
    h: startNode.h ?? NODE_H,
  });

  const startHandleObj = handles.find((h) => h.id === startHandle);
  if (!startHandleObj) return null;

  const cx = (startNode.w ?? NODE_W) / 2;
  const cy = (startNode.h ?? NODE_H) / 2;
  const startPoint = {
    x: startNode.x + cx + (startHandleObj.x - cx),
    y: startNode.y + cy + (startHandleObj.y - cy),
  };

  // Build a smooth bezier curve from start to current mouse position
  const mx = (startPoint.x + currentMousePos.x) / 2;
  const path = `M ${startPoint.x} ${startPoint.y} C ${mx} ${startPoint.y}, ${mx} ${currentMousePos.y}, ${currentMousePos.x} ${currentMousePos.y}`;

  return (
    <svg
      className="absolute inset-0 pointer-events-none overflow-visible"
      style={{ width: "100%", height: "100%" }}
    >
      <defs>
        <filter id="liveEdgeGlow">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>
      <path
        d={path}
        fill="none"
        stroke={accentColor}
        strokeWidth={2}
        strokeOpacity={0.8}
        filter="url(#liveEdgeGlow)"
        strokeLinecap="round"
      />
      {/* Endpoint indicator */}
      <circle
        cx={currentMousePos.x}
        cy={currentMousePos.y}
        r={6}
        fill={accentColor}
        stroke="white"
        strokeWidth={2}
        style={{ filter: "drop-shadow(0 0 4px " + accentColor + ")" }}
      />
    </svg>
  );
}

// ─── Hook: Drag to Connect Logic ──────────────────────────────────────────────

export interface UseDragToConnectOptions {
  nodes: Array<PositionedNode & { id: string }>;
  zoom: number;
  canvasRef: React.RefObject<HTMLDivElement>;
  onConnect: (
    fromNodeId: string,
    fromHandle: HandleSegment,
    toNodeId: string,
    toHandle: HandleSegment
  ) => void;
  snapThreshold?: number;
}

export interface DragToConnectState {
  isDragging: boolean;
  fromNodeId: string | null;
  fromHandle: HandleSegment | null;
  mousePos: Point | null;
  hoveredNodeId: string | null;
  hoveredHandle: HandleSegment | null;
}

export function useDragToConnect({
  nodes,
  zoom,
  canvasRef,
  onConnect,
  snapThreshold = 20,
}: UseDragToConnectOptions) {
  const [state, setState] = useState<DragToConnectState>({
    isDragging: false,
    fromNodeId: null,
    fromHandle: null,
    mousePos: null,
    hoveredNodeId: null,
    hoveredHandle: null,
  });

  const startDrag = useCallback(
    (nodeId: string, handleId: HandleSegment, startPos: Point) => {
      setState({
        isDragging: true,
        fromNodeId: nodeId,
        fromHandle: handleId,
        mousePos: startPos,
        hoveredNodeId: null,
        hoveredHandle: null,
      });
    },
    []
  );

  const updateMousePos = useCallback(
    (clientX: number, clientY: number) => {
      if (!state.isDragging || !canvasRef.current) return;

      const rect = canvasRef.current.getBoundingClientRect();
      const x = (clientX - rect.left) / zoom;
      const y = (clientY - rect.top) / zoom;

      // Find if we're hovering over any node's handle
      let hoveredNodeId: string | null = null;
      let hoveredHandle: HandleSegment | null = null;
      let minDist = snapThreshold;

      for (const node of nodes) {
        if (node.id === state.fromNodeId) continue;

        const handles = anchorHandles(node);
        const cx = (node.w ?? NODE_W) / 2;
        const cy = (node.h ?? NODE_H) / 2;

        for (const h of handles) {
          const portX = node.x + cx + (h.x - cx);
          const portY = node.y + cy + (h.y - cy);
          const dist = Math.hypot(x - portX, y - portY);

          if (dist < minDist) {
            minDist = dist;
            hoveredNodeId = node.id;
            hoveredHandle = h.id;
          }
        }
      }

      setState((prev) => ({
        ...prev,
        mousePos: { x, y },
        hoveredNodeId,
        hoveredHandle,
      }));
    },
    [state.isDragging, state.fromNodeId, nodes, zoom, canvasRef, snapThreshold]
  );

  const endDrag = useCallback(() => {
    if (
      state.isDragging &&
      state.fromNodeId &&
      state.fromHandle &&
      state.hoveredNodeId &&
      state.hoveredHandle
    ) {
      onConnect(
        state.fromNodeId,
        state.fromHandle,
        state.hoveredNodeId,
        state.hoveredHandle
      );
    }

    setState({
      isDragging: false,
      fromNodeId: null,
      fromHandle: null,
      mousePos: null,
      hoveredNodeId: null,
      hoveredHandle: null,
    });
  }, [state, onConnect]);

  // Set up global mouse event listeners during drag
  useEffect(() => {
    if (!state.isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      updateMousePos(e.clientX, e.clientY);
    };

    const handleMouseUp = () => {
      endDrag();
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [state.isDragging, updateMousePos, endDrag]);

  return {
    ...state,
    startDrag,
    updateMousePos,
    endDrag,
  };
}
