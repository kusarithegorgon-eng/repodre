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

import { useState, useCallback, useEffect, useRef } from "react";
import type { Point, HandleSegment, Shape, PositionedNode } from "@/lib/canvas-geometry";
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
  snapThreshold = 40,
}: UseDragToConnectOptions) {
  const [state, setState] = useState<DragToConnectState>({
    isDragging: false,
    fromNodeId: null,
    fromHandle: null,
    mousePos: null,
    hoveredNodeId: null,
    hoveredHandle: null,
  });

  // Ref mirror so the global mouseup listener always reads the freshest state
  // (avoids stale-closure bugs where hoveredNodeId is still null at drop time).
  const stateRef = useRef(state);
  stateRef.current = state;
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const onConnectRef = useRef(onConnect);
  onConnectRef.current = onConnect;

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
      if (!stateRef.current.isDragging || !canvasRef.current) return;

      const rect = canvasRef.current.getBoundingClientRect();
      const x = (clientX - rect.left) / zoom;
      const y = (clientY - rect.top) / zoom;

      // Find if we're hovering over any node's handle
      let hoveredNodeId: string | null = null;
      let hoveredHandle: HandleSegment | null = null;
      let minDist = snapThreshold;

      for (const node of nodesRef.current) {
        if (node.id === stateRef.current.fromNodeId) continue;

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
    [zoom, canvasRef, snapThreshold]
  );

  /**
   * Fallback hit-test at drop time: if no handle was close enough, check
   * whether the cursor landed inside (or near) a node's bounding box and
   * snap to the nearest handle on that node. This makes the connection
   * succeed even when the user releases slightly off the port.
   */
  const findDropTarget = useCallback(
    (x: number, y: number): { nodeId: string; handle: HandleSegment } | null => {
      const fromId = stateRef.current.fromNodeId;
      let bestNode: string | null = null;
      let bestDist = Infinity;

      for (const node of nodesRef.current) {
        if (node.id === fromId) continue;
        const w = node.w ?? NODE_W;
        const h = node.h ?? NODE_H;
        // Expanded bounding box with snap padding around the node body
        const pad = snapThreshold;
        const left = node.x - pad;
        const right = node.x + w + pad;
        const top = node.y - pad;
        const bottom = node.y + h + pad;

        if (x >= left && x <= right && y >= top && y <= bottom) {
          // Distance to node center — pick the closest node if overlapping
          const cx = node.x + w / 2;
          const cy = node.y + h / 2;
          const d = Math.hypot(x - cx, y - cy);
          if (d < bestDist) {
            bestDist = d;
            bestNode = node.id;
          }
        }
      }

      if (!bestNode) return null;

      // Snap to the nearest handle on the chosen node
      const target = nodesRef.current.find((n) => n.id === bestNode);
      if (!target) return null;

      const handles = anchorHandles(target);
      const cx = (target.w ?? NODE_W) / 2;
      const cy = (target.h ?? NODE_H) / 2;
      let nearestHandle: HandleSegment = "e";
      let nearestDist = Infinity;

      for (const h of handles) {
        const portX = target.x + cx + (h.x - cx);
        const portY = target.y + cy + (h.y - cy);
        const dist = Math.hypot(x - portX, y - portY);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearestHandle = h.id;
        }
      }

      return { nodeId: bestNode, handle: nearestHandle };
    },
    [snapThreshold]
  );

  const endDrag = useCallback(() => {
    const cur = stateRef.current;
    if (!cur.isDragging || !cur.fromNodeId || !cur.fromHandle) {
      setState({
        isDragging: false,
        fromNodeId: null,
        fromHandle: null,
        mousePos: null,
        hoveredNodeId: null,
        hoveredHandle: null,
      });
      return;
    }

    let targetNodeId = cur.hoveredNodeId;
    let targetHandle = cur.hoveredHandle;

    // Fallback: if no handle was hovered, try a body hit-test at the last
    // known mouse position so a near-miss still anchors the connection.
    if ((!targetNodeId || !targetHandle) && cur.mousePos) {
      const drop = findDropTarget(cur.mousePos.x, cur.mousePos.y);
      if (drop) {
        targetNodeId = drop.nodeId;
        targetHandle = drop.handle;
      }
    }

    if (targetNodeId && targetHandle) {
      onConnectRef.current(
        cur.fromNodeId,
        cur.fromHandle,
        targetNodeId,
        targetHandle
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
  }, [findDropTarget]);

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
