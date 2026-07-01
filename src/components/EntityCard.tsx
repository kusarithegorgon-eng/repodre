/**
 * EntityCard — ERD table entity card
 *
 * Renders a database table as a dense, multi-row card in the ERD viewport.
 * Each row shows the column name, data type, and constraint badges
 * (PK / FK / UNIQUE). The card has a colored header strip and a subtle
 * accent border matching the canvas palette.
 */

import { Key, Link2, Shield, Trash2 } from "lucide-react";
import type { ErdTableNode } from "@/lib/erd-layout";
import { ERD_HEADER_HEIGHT, ERD_ROW_HEIGHT } from "@/lib/erd-layout";

interface EntityCardProps {
  table: ErdTableNode;
  selected: boolean;
  highlightedColumn?: string;
  onSelect: (e: React.MouseEvent) => void;
  onDelete?: () => void;
}

export function EntityCard({ table, selected, highlightedColumn, onSelect, onDelete }: EntityCardProps) {
  return (
    <div
      className="group absolute rounded-lg border bg-surface-raised shadow-lg transition-all duration-200"
      style={{
        left: table.x,
        top: table.y,
        width: table.width,
        height: table.height,
        borderColor: selected ? "var(--teal)" : "var(--border)",
        boxShadow: selected
          ? "0 0 0 1px var(--teal), 0 0 20px -4px var(--teal)"
          : "0 4px 12px -4px rgba(0,0,0,0.4)",
        cursor: "pointer",
        zIndex: selected ? 10 : 1,
      }}
      onClick={onSelect}
    >
      {/* Header strip */}
      <div
        className="flex items-center gap-2 px-3 rounded-t-lg border-b"
        style={{
          height: ERD_HEADER_HEIGHT,
          borderColor: "var(--border)",
          background: "color-mix(in oklab, var(--neon-blue) 14%, var(--surface-raised))",
        }}
      >
        <div className="flex h-5 w-5 items-center justify-center rounded bg-neon-blue/20">
          <svg viewBox="0 0 14 16" fill="none" className="h-3.5 w-3.5">
            <rect x="1" y="3" width="12" height="10" stroke="var(--neon-blue)" strokeWidth="1.2" />
            <ellipse cx="7" cy="3" rx="6" ry="2.5" stroke="var(--neon-blue)" strokeWidth="1.2" />
            <ellipse cx="7" cy="13" rx="6" ry="2.5" stroke="var(--neon-blue)" strokeWidth="1.2" />
          </svg>
        </div>
        <span className="font-mono text-sm font-semibold text-foreground truncate">
          {table.name}
        </span>
        <span className="ml-auto text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {table.columns.length} cols
        </span>
        {onDelete && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            title="Delete table (cascades edges)"
            className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground/60 transition-colors hover:bg-red-500/10 hover:text-red-500"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Column rows */}
      <div className="flex flex-col">
        {table.columns.map((col, i) => {
          const isHighlighted = highlightedColumn === col.name;
          return (
            <div
              key={col.name}
              data-column={col.name}
              className="flex items-center gap-2 px-3 transition-colors hover:bg-accent/40"
              style={{
                height: ERD_ROW_HEIGHT,
                background: isHighlighted ? "color-mix(in oklab, var(--teal) 18%, transparent)" : undefined,
                borderBottom: i < table.columns.length - 1 ? "1px solid var(--border)" : "none",
              }}
            >
              {/* PK / FK icon */}
              <div className="flex w-5 shrink-0 items-center justify-center">
                {col.pk ? (
                  <Key className="h-3.5 w-3.5 text-yellow-400" />
                ) : col.fk ? (
                  <Link2 className="h-3.5 w-3.5 text-neon-purple" />
                ) : null}
              </div>

              {/* Column name */}
              <span
                className={`font-mono text-xs truncate ${
                  col.pk ? "font-semibold text-foreground" : "text-muted-foreground"
                }`}
              >
                {col.name}
              </span>

              {/* Type */}
              <span className="ml-auto font-mono text-[10px] text-muted-foreground/80">
                {col.type}
              </span>

              {/* Badges */}
              <div className="flex shrink-0 items-center gap-1">
                {col.unique && !col.pk && (
                  <span
                    title="UNIQUE"
                    className="flex h-4 w-4 items-center justify-center rounded bg-teal/20"
                  >
                    <Shield className="h-2.5 w-2.5 text-teal" />
                  </span>
                )}
                {!col.nullable && !col.pk && (
                  <span className="text-[9px] font-bold text-red-400/80" title="NOT NULL">
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
