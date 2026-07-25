import { useCallback, useRef, useState } from "react";

/**
 * Undo/redo history stack for the canvas graph (nodes + edges + selection).
 *
 * Each call to `commit()` pushes a snapshot of the current state onto the
 * undo stack and clears the redo stack. Call `commit()` after a logical
 * mutation is complete (e.g. on drag-end, after a delete, after an edge is
 * created) — not on every intermediate mousemove.
 *
 * `undo()` and `redo()` swap between snapshots and return the restored
 * state so the caller can apply it to both React state and the database.
 */

export interface GraphSnapshot<N, E> {
  nodes: N[];
  edges: E[];
  selected: string | null;
}

export interface GraphHistoryResult<N, E> {
  /** Current state (what the caller should render). */
  present: GraphSnapshot<N, E>;
  /** Replace the present state WITHOUT pushing a history entry (used by undo/redo restore). */
  replace: (next: GraphSnapshot<N, E>) => void;
  /** Push the current state onto the undo stack. Call after a mutation completes. */
  commit: (next: GraphSnapshot<N, E>) => void;
  /** Restore the previous snapshot. Returns the restored state or null. */
  undo: () => GraphSnapshot<N, E> | null;
  /** Restore the next snapshot (re-applies an undone change). Returns the restored state or null. */
  redo: () => GraphSnapshot<N, E> | null;
  canUndo: boolean;
  canRedo: boolean;
  /** Clear all history (e.g. when switching projects). */
  reset: (initial: GraphSnapshot<N, E>) => void;
}

const MAX_HISTORY = 50;

export function useGraphHistory<N, E>(
  initial: GraphSnapshot<N, E>
): GraphHistoryResult<N, E> {
  const [present, setPresent] = useState<GraphSnapshot<N, E>>(initial);
  const undoStack = useRef<GraphSnapshot<N, E>[]>([]);
  const redoStack = useRef<GraphSnapshot<N, E>[]>([]);
  const [version, setVersion] = useState(0); // bump to re-render canUndo/canRedo

  const replace = useCallback((next: GraphSnapshot<N, E>) => {
    setPresent(next);
  }, []);

  const commit = useCallback((next: GraphSnapshot<N, E>) => {
    setPresent((prev) => {
      undoStack.current.push(prev);
      if (undoStack.current.length > MAX_HISTORY) undoStack.current.shift();
      redoStack.current = [];
      setVersion((v) => v + 1);
      return next;
    });
  }, []);

  const undo = useCallback((): GraphSnapshot<N, E> | null => {
    if (undoStack.current.length === 0) return null;
    const prev = undoStack.current.pop()!;
    setPresent((curr) => {
      redoStack.current.push(curr);
      return prev;
    });
    setVersion((v) => v + 1);
    return prev;
  }, []);

  const redo = useCallback((): GraphSnapshot<N, E> | null => {
    if (redoStack.current.length === 0) return null;
    const next = redoStack.current.pop()!;
    setPresent((curr) => {
      undoStack.current.push(curr);
      return next;
    });
    setVersion((v) => v + 1);
    return next;
  }, []);

  const reset = useCallback((init: GraphSnapshot<N, E>) => {
    undoStack.current = [];
    redoStack.current = [];
    setPresent(init);
    setVersion((v) => v + 1);
  }, []);

  // version is read so canUndo/canRedo re-evaluate after each operation
  void version;

  return {
    present,
    replace,
    commit,
    undo,
    redo,
    canUndo: undoStack.current.length > 0,
    canRedo: redoStack.current.length > 0,
    reset,
  };
}
