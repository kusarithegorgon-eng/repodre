/**
 * InlineLabelEditor — Double-Click Inline Mutations
 *
 * A minimalist, borderless text input that appears on double-click
 * over node labels, sub-labels, and column names. Saves on Enter or blur.
 */

import { useState, useEffect, useRef, useCallback } from "react";

interface InlineLabelEditorProps {
  value: string;
  onSave: (newValue: string) => void;
  onCancel?: () => void;
  className?: string;
  maxWidth?: number;
  autoFocus?: boolean;
  selectAllOnFocus?: boolean;
}

export function InlineLabelEditor({
  value,
  onSave,
  onCancel,
  className = "",
  maxWidth = 180,
  autoFocus = true,
  selectAllOnFocus = true,
}: InlineLabelEditorProps) {
  const [tempValue, setTempValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
      if (selectAllOnFocus) {
        inputRef.current.select();
      }
    }
  }, [autoFocus, selectAllOnFocus]);

  const handleSave = useCallback(() => {
    const trimmed = tempValue.trim();
    if (trimmed && trimmed !== value) {
      onSave(trimmed);
    } else {
      onCancel?.();
    }
  }, [tempValue, value, onSave, onCancel]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleSave();
      } else if (e.key === "Escape") {
        e.preventDefault();
        setTempValue(value);
        onCancel?.();
      }
    },
    [handleSave, onCancel, value]
  );

  return (
    <input
      ref={inputRef}
      type="text"
      value={tempValue}
      onChange={(e) => setTempValue(e.target.value)}
      onBlur={handleSave}
      onKeyDown={handleKeyDown}
      className={`${className} inline-label-editor`}
      style={{
        background: "transparent",
        border: "none",
        outline: "none",
        width: "100%",
        maxWidth,
        fontFamily: "inherit",
        fontSize: "inherit",
        fontWeight: "inherit",
        color: "inherit",
        textAlign: "center",
        caretColor: "var(--teal)",
      }}
      spellCheck={false}
    />
  );
}

// ─── Editable Label Wrapper ─────────────────────────────────────────────────

interface EditableLabelProps {
  value: string;
  onSave: (newValue: string) => void;
  className?: string;
  maxWidth?: number;
  children?: React.ReactNode;
  /** Whether editing is enabled */
  editable?: boolean;
  /** Tooltip shown on hover */
  editHint?: string;
}

export function EditableLabel({
  value,
  onSave,
  className = "",
  maxWidth = 180,
  children,
  editable = true,
  editHint = "Double-click to edit",
}: EditableLabelProps) {
  const [isEditing, setIsEditing] = useState(false);

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (editable) {
        setIsEditing(true);
      }
    },
    [editable]
  );

  const handleSave = useCallback(
    (newValue: string) => {
      setIsEditing(false);
      onSave(newValue);
    },
    [onSave]
  );

  const handleCancel = useCallback(() => {
    setIsEditing(false);
  }, []);

  if (isEditing) {
    return (
      <InlineLabelEditor
        value={value}
        onSave={handleSave}
        onCancel={handleCancel}
        className={className}
        maxWidth={maxWidth}
      />
    );
  }

  return (
    <span
      className={`${className} ${editable ? "cursor-text" : ""}`}
      onDoubleClick={handleDoubleClick}
      title={editable ? editHint : undefined}
      style={{ maxWidth }}
    >
      {children || value}
    </span>
  );
}

// ─── Editable Column Row (for ERD tables) ────────────────────────────────────

interface EditableColumnProps {
  name: string;
  type: string;
  onSaveName: (newName: string) => void;
  onSaveType?: (newType: string) => void;
  editable?: boolean;
}

export function EditableColumnRow({
  name,
  type,
  onSaveName,
  onSaveType,
  editable = true,
}: EditableColumnProps) {
  const [editingField, setEditingField] = useState<"name" | "type" | null>(null);

  const handleSaveName = useCallback(
    (newName: string) => {
      setEditingField(null);
      if (newName !== name) onSaveName(newName);
    },
    [name, onSaveName]
  );

  const handleSaveType = useCallback(
    (newType: string) => {
      setEditingField(null);
      if (onSaveType && newType !== type) onSaveType(newType);
    },
    [type, onSaveType]
  );

  if (editingField === "name") {
    return (
      <InlineLabelEditor
        value={name}
        onSave={handleSaveName}
        onCancel={() => setEditingField(null)}
        className="font-mono text-xs"
        maxWidth={120}
      />
    );
  }

  if (editingField === "type" && onSaveType) {
    return (
      <span className="flex items-center gap-2">
        <span>{name}</span>
        <InlineLabelEditor
          value={type}
          onSave={handleSaveType}
          onCancel={() => setEditingField(null)}
          className="font-mono text-[10px] text-muted-foreground"
          maxWidth={80}
        />
      </span>
    );
  }

  return (
    <span className="flex items-center gap-2">
      <span
        className={`${editable ? "cursor-text hover:text-teal" : ""} font-mono text-xs truncate`}
        onDoubleClick={(e) => {
          e.stopPropagation();
          if (editable) setEditingField("name");
        }}
        title={editable ? "Double-click to rename" : undefined}
      >
        {name}
      </span>
      <span
        className={`${editable && onSaveType ? "cursor-text hover:text-teal" : ""} font-mono text-[10px] text-muted-foreground`}
        onDoubleClick={(e) => {
          e.stopPropagation();
          if (editable && onSaveType) setEditingField("type");
        }}
        title={editable && onSaveType ? "Double-click to change type" : undefined}
      >
        {type}
      </span>
    </span>
  );
}
