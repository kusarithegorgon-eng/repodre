/**
 * LiveCursors — Real-time Collaborative Cursors via Supabase Realtime
 *
 * Broadcasts the local user's cursor position on the canvas and renders
 * remote collaborators' cursors with name labels and presence avatars.
 * Uses Supabase Realtime broadcast channels (no extra tables required).
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { User as SupabaseUser } from "@supabase/supabase-js";

export interface CursorPosition {
  userId: string;
  userName: string;
  avatarUrl?: string;
  /** canvas-space x (already divided by zoom) */
  x: number;
  /** canvas-space y (already divided by zoom) */
  y: number;
  /** ISO timestamp of last movement */
  ts: number;
}

interface LiveCursorsProps {
  projectId: string | null;
  /** current zoom level (e.g. 100 for 100%) */
  zoom: number;
  /** current pan X in px */
  panX: number;
  /** current pan Y in px */
  panY: number;
  /** the canvas DOM element (for measuring mouse position) */
  canvasRef: React.RefObject<HTMLDivElement>;
}

const STALE_CURSOR_MS = 10000;
const HEARTBEAT_MS = 3000;

// Deterministic color from a user id
function colorForId(id: string): string {
  const colors = ["#dc2626", "#ea580c", "#d97706", "#16a34a", "#0891b2", "#2563eb", "#7c3aed", "#c026d3"];
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return colors[Math.abs(hash) % colors.length];
}

export function useLiveCursors({ projectId, zoom, panX, panY, canvasRef }: LiveCursorsProps) {
  const [remoteCursors, setRemoteCursors] = useState<Map<string, CursorPosition>>(new Map());
  const [isConnected, setIsConnected] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const userIdRef = useRef<string>("");
  const userNameRef = useRef<string>("");
  const avatarRef = useRef<string | undefined>(undefined);
  const lastBroadcastRef = useRef<number>(0);
  const currentPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Hydrate local user identity
  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!mounted || !user) return;
      userIdRef.current = user.id;
      const meta = user.user_metadata as { login?: string; avatar_url?: string; full_name?: string } | undefined;
      userNameRef.current = meta?.login || meta?.full_name || user.email?.split("@")[0] || "User";
      avatarRef.current = meta?.avatar_url;
    });
    return () => { mounted = false; };
  }, []);

  // Connect to the realtime channel for this project
  useEffect(() => {
    if (!projectId) return;

    const channel = supabase.channel(`cursors-${projectId}`, {
      config: { broadcast: { self: false }, presence: { key: userIdRef.current || "anon" } },
    });

    channel
      .on("broadcast", { event: "cursor" }, (payload) => {
        const cursor = payload.payload as CursorPosition;
        if (!cursor || !cursor.userId || cursor.userId === userIdRef.current) return;
        setRemoteCursors((prev) => {
          const next = new Map(prev);
          next.set(cursor.userId, cursor);
          return next;
        });
      })
      .on("broadcast", { event: "cursor-leave" }, (payload) => {
        const leavingId = (payload.payload as { userId: string })?.userId;
        if (!leavingId) return;
        setRemoteCursors((prev) => {
          const next = new Map(prev);
          next.delete(leavingId);
          return next;
        });
      })
      .subscribe((status) => {
        setIsConnected(status === "SUBSCRIBED");
      });

    channelRef.current = channel;

    // Heartbeat: re-broadcast our position periodically so new joiners see us
    const heartbeat = setInterval(() => {
      if (channelRef.current && userIdRef.current) {
        channelRef.current.send({
          type: "broadcast",
          event: "cursor",
          payload: {
            userId: userIdRef.current,
            userName: userNameRef.current,
            avatarUrl: avatarRef.current,
            x: currentPosRef.current.x,
            y: currentPosRef.current.y,
            ts: Date.now(),
          } satisfies CursorPosition,
        });
      }
    }, HEARTBEAT_MS);

    // Stale cursor cleanup
    const cleanup = setInterval(() => {
      const now = Date.now();
      setRemoteCursors((prev) => {
        let changed = false;
        const next = new Map(prev);
        for (const [id, cursor] of next) {
          if (now - cursor.ts > STALE_CURSOR_MS) {
            next.delete(id);
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 2000);

    return () => {
      clearInterval(heartbeat);
      clearInterval(cleanup);
      // Announce departure
      if (channelRef.current && userIdRef.current) {
        channelRef.current.send({
          type: "broadcast",
          event: "cursor-leave",
          payload: { userId: userIdRef.current },
        });
      }
      supabase.removeChannel(channel);
      channelRef.current = null;
      setIsConnected(false);
      setRemoteCursors(new Map());
    };
  }, [projectId]);

  // Mouse move handler — attach to the canvas element
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!canvasRef.current || !channelRef.current || !userIdRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const scale = zoom / 100;
    // Convert screen coords → canvas-space coords (undo pan + zoom)
    const x = (e.clientX - rect.left - panX) / scale;
    const y = (e.clientY - rect.top - panY) / scale;
    currentPosRef.current = { x, y };

    // Throttle broadcasts to ~30fps
    const now = Date.now();
    if (now - lastBroadcastRef.current < 33) return;
    lastBroadcastRef.current = now;

    channelRef.current.send({
      type: "broadcast",
      event: "cursor",
      payload: {
        userId: userIdRef.current,
        userName: userNameRef.current,
        avatarUrl: avatarRef.current,
        x,
        y,
        ts: now,
      } satisfies CursorPosition,
    });
  }, [zoom, panX, panY, canvasRef]);

  // Attach/detach the global mousemove listener
  useEffect(() => {
    if (!projectId) return;
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [projectId, handleMouseMove]);

  return { remoteCursors, isConnected };
}

/**
 * Render remote cursors on the canvas. Must be placed inside the transformed
 * canvas container so coordinates are in canvas-space.
 */
export function RemoteCursorLayer({
  cursors,
}: {
  cursors: Map<string, CursorPosition>;
}) {
  return (
    <div className="pointer-events-none absolute inset-0 z-40 overflow-visible">
      {Array.from(cursors.values()).map((cursor) => {
        const color = colorForId(cursor.userId);
        const initials = cursor.userName.charAt(0).toUpperCase();
        return (
          <div
            key={cursor.userId}
            className="absolute transition-transform duration-75 ease-out"
            style={{ left: cursor.x, top: cursor.y, transform: "translate(-2px, -2px)" }}
          >
            {/* Cursor arrow */}
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="drop-shadow-md">
              <path
                d="M3 2 L3 16 L7 12 L10 18 L12 17 L9 11 L15 11 Z"
                fill={color}
                stroke="white"
                strokeWidth="1"
                strokeLinejoin="round"
              />
            </svg>
            {/* Name label */}
            <div
              className="absolute left-4 top-3 flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium text-white shadow-md"
              style={{ background: color }}
            >
              {cursor.avatarUrl ? (
                <img src={cursor.avatarUrl} alt="" className="h-3.5 w-3.5 rounded-full" />
              ) : (
                <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-white/30 text-[8px]">
                  {initials}
                </span>
              )}
              <span className="max-w-[80px] truncate">{cursor.userName}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
