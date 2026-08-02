/**
 * EntityCard — ERD table entity card
 *
 * Renders a database table as a dense, multi-row card in the ERD viewport.
 * Each row shows the column name, data type, and constraint badges.
 * Double-click any field to edit it in-place.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { Key, Link2, Shield, Trash2, Pencil } from "lucide-react";
import type { ErdTableNode, ErdColumnRow } from "@/lib/erd-layout";
import { ERD_HEADER_HEIGHT, ERD_ROW_HEIGHT } from "@/lib/erd-layout";

interface EntityCardProps {
  table: ErdTableNode;
  selected: boolean;
  highlightedColumn?: string;
  onSelect: (e: React.MouseEvent) => void;
  onDelete?: () => void;
  onRenameColumn?: (oldName: string, newName: string) => void;
  onRenameTable?: (newName: string) => void;
  /** FK reference targets: maps column name → "Table.column" for FK rows */
  fkReferences?: Map<string, string>;
}

const ACCENT_TINTS: Record<string, string> = {
  blue:   "color-mix(in oklab, var(--neon-blue) 12%, var(--surface-raised))",
  green:  "color-mix(in oklab, var(--neon-green) 12%, var(--surface-raised))",
  teal:   "color-mix(in oklab, var(--teal) 12%, var(--surface-raised))",
  orange: "color-mix(in oklab, var(--neon-orange) 12%, var(--surface-raised))",
  red:    "color-mix(in oklab, var(--neon-red) 12%, var(--surface-raised))",
  purple: "color-mix(in oklab, var(--neon-purple) 12%, var(--surface-raised))",
};

const ACCENT_ICON_TINTS: Record<string, string> = {
  blue:   "var(--neon-blue)",
  green:  "var(--neon-green)",
  teal:   "var(--teal)",
  orange: "var(--neon-orange)",
  red:    "var(--neon-red)",
  purple: "var(--neon-purple)",
};

// ─── Inline editable field ────────────────────────────────────────────────────

interface InlineEditProps {
  value: string;
  onSave: (value: string) => void;
  className?: string;
  style?: React.CSSProperties;
}

function InlineEdit({ value, onSave, className = "", style }: InlineEditProps) {
  const [editing, setEditing] = useState(false);
  const [temp, setTemp] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commit = useCallback(() => {
    const trimmed = temp.trim();
    if (trimmed && trimmed !== value) onSave(trimmed);
    else setTemp(value);
    setEditing(false);
  }, [temp, value, onSave]);

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={temp}
        onChange={(e) => setTemp(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); commit(); }
          if (e.key === "Escape") { setTemp(value); setEditing(false); }
          e.stopPropagation();
        }}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        className={`${className} rounded border border-teal bg-background px-1 outline-none ring-1 ring-teal/40`}
        style={{ ...style, fontFamily: "ui-monospace, monospace" }}
      />
    );
  }

  return (
    <span
      className={`${className} group/edit relative cursor-text`}
      style={style}
      onDoubleClick={(e) => { e.stopPropagation(); setEditing(true); setTemp(value); }}
      title="Double-click to rename"
    >
      {value}
      <Pencil className="ml-1 inline h-2.5 w-2.5 opacity-0 group-hover/edit:opacity-40 transition-opacity" />
    </span>
  );
}

// ─── EntityCard ───────────────────────────────────────────────────────────────

export function EntityCard({ table, selected, highlightedColumn, onSelect, onDelete, onRenameColumn, onRenameTable, fkReferences }: EntityCardProps) {
  const accentKey = table.accent ?? "blue";
  const headerTint = selected
    ? "color-mix(in oklab, var(--teal) 12%, var(--surface-raised))"
    : ACCENT_TINTS[accentKey] ?? ACCENT_TINTS.blue;
  const iconTint = ACCENT_ICON_TINTS[accentKey] ?? ACCENT_ICON_TINTS.blue;
  const iconBg = `color-mix(in oklab, ${iconTint} 20%, transparent)`;

  return (
    <div
      className="group absolute rounded-xl border bg-surface-raised shadow-lg transition-all duration-200"
      style={{
        left: table.x,
        top: table.y,
        width: table.width,
        height: table.height,
        borderColor: selected ? "var(--teal)" : "var(--border)",
        boxShadow: selected
          ? "0 0 0 1.5px var(--teal), 0 0 24px -4px color-mix(in oklab, var(--teal) 40%, transparent)"
          : "0 4px 16px -4px rgba(0,0,0,0.35)",
        cursor: "grab",
        zIndex: selected ? 10 : 1,
      }}
      onClick={onSelect}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 rounded-t-xl border-b"
        style={{
          height: ERD_HEADER_HEIGHT,
          borderColor: "var(--border)",
          background: headerTint,
        }}
      >
        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded" style={{ background: iconBg }}>
          <svg viewBox="0 0 14 16" fill="none" className="h-3.5 w-3.5">
            <rect x="1" y="3" width="12" height="10" stroke={iconTint} strokeWidth="1.2" />
            <ellipse cx="7" cy="3" rx="6" ry="2.5" stroke={iconTint} strokeWidth="1.2" />
            <ellipse cx="7" cy="13" rx="6" ry="2.5" stroke={iconTint} strokeWidth="1.2" />
          </svg>
        </div>

        {onRenameTable ? (
          <InlineEdit
            value={table.name}
            onSave={onRenameTable}
            className="font-mono text-sm font-semibold text-foreground truncate flex-1"
          />
        ) : (
          <span className="font-mono text-sm font-semibold text-foreground truncate flex-1">
            {table.name}
          </span>
        )}

        <span className="ml-auto shrink-0 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {table.columns.length}c
        </span>

        {onDelete && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            title="Delete table"
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground/50 opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500/10 hover:text-red-500"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Column rows */}
      <div className="flex flex-col">
        {table.columns.map((col, i) => {
          const isHighlighted = highlightedColumn === col.name;
          const isAltRow = i % 2 === 1;
          const fkRef = col.fk ? fkReferences?.get(col.name) : undefined;
          return (
            <div
              key={col.name}
              data-column={col.name}
              className="group/row flex items-center gap-2 px-3 transition-colors hover:bg-accent/30"
              style={{
                height: ERD_ROW_HEIGHT,
                background: isHighlighted
                  ? "color-mix(in oklab, var(--teal) 16%, transparent)"
                  : isAltRow
                  ? "color-mix(in oklab, var(--border) 22%, transparent)"
                  : undefined,
                borderBottom: i < table.columns.length - 1 ? "1px solid var(--border)" : "none",
              }}
            >
              {/* PK / FK icon */}
              <div className="flex w-4 shrink-0 items-center justify-center">
                {col.pk ? (
                  <Key className="h-3 w-3 text-yellow-400" title="Primary Key" />
                ) : col.fk ? (
                  <Link2 className="h-3 w-3 text-neon-purple" title={fkRef ? `FK → ${fkRef}` : "Foreign Key"} />
                ) : (
                  <span className="h-3 w-3" />
                )}
              </div>

              {/* Column name */}
              {onRenameColumn ? (
                <InlineEdit
                  value={col.name}
                  onSave={(newName) => onRenameColumn(col.name, newName)}
                  className={`font-mono text-xs truncate ${
                    col.pk ? "font-semibold text-foreground" : "text-muted-foreground"
                  }`}
                />
              ) : (
                <span
                  className={`font-mono text-xs truncate ${
                    col.pk ? "font-semibold text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {col.name}
                </span>
              )}

              {/* FK reference target (e.g. "users.id") */}
              {fkRef && (
                <span className="ml-1 font-mono text-[9px] text-neon-purple/60 truncate hidden group-hover/row:inline" title={`References ${fkRef}`}>
                  → {fkRef}
                </span>
              )}

              {/* Type */}
              <span className="ml-auto font-mono text-[10px] text-muted-foreground/70 shrink-0">
                {col.type}
              </span>

              {/* Badges */}
              <div className="flex shrink-0 items-center gap-0.5">
                {col.unique && !col.pk && (
                  <span title="UNIQUE" className="flex h-4 w-4 items-center justify-center rounded bg-teal/15">
                    <Shield className="h-2.5 w-2.5 text-teal" />
                  </span>
                )}
                {!col.nullable && !col.pk && (
                  <span className="text-[10px] font-bold text-red-400/70 leading-none" title="NOT NULL">
                    •
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
