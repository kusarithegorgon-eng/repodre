import { useEffect } from "react";

/**
 * Global keyboard shortcuts for the canvas.
 *
 * - Delete / Backspace: delete the selected node or edge (ignored when
 *   typing in an input/textarea/contentEditable element).
 * - Escape: clear the current selection.
 * - Cmd/Ctrl+Z: undo.
 * - Cmd/Ctrl+Shift+Z or Cmd/Ctrl+Y: redo.
 *
 * All handlers are no-ops when the active element is a form field so inline
 * editing (InlineEdit) and other text inputs are not disrupted.
 */

export interface KeyboardShortcutHandlers {
  onDelete: () => void;
  onEscape: () => void;
  onUndo: () => void;
  onRedo: () => void;
}

function isEditing(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

export function useKeyboardShortcuts(handlers: KeyboardShortcutHandlers): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditing(e.target)) return;

      const mod = e.metaKey || e.ctrlKey;

      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) handlers.onRedo();
        else handlers.onUndo();
        return;
      }
      if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        handlers.onRedo();
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        handlers.onDelete();
        return;
      }
      if (e.key === "Escape") {
        handlers.onEscape();
        return;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handlers]);
}
