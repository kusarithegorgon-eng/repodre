/**
 * ErdGuide — Cardinality Reference Panel
 *
 * Floating panel with a reference table of Crow's Foot cardinality symbols,
 * their names, and real-world definitions. Designed for non-technical users.
 */

import { X, BookOpen } from "lucide-react";

interface ErdGuideProps {
  isOpen: boolean;
  onClose: () => void;
}

const CARDINALITY_ROWS = [
  {
    symbol: "1:1",
    name: "One-to-One",
    example: "User ↔ Profile",
    description: "Each row in table A relates to exactly one row in table B. Like a passport and its holder — one person, one passport.",
    svgLeft: (
      <g>
        <line x1="0" y1="12" x2="36" y2="12" stroke="var(--teal)" strokeWidth="1.5" />
        <line x1="30" y1="6" x2="30" y2="18" stroke="var(--teal)" strokeWidth="1.5" />
        <line x1="24" y1="6" x2="24" y2="18" stroke="var(--teal)" strokeWidth="1.5" />
      </g>
    ),
    svgRight: (
      <g>
        <line x1="0" y1="12" x2="36" y2="12" stroke="var(--teal)" strokeWidth="1.5" />
        <line x1="6" y1="6" x2="6" y2="18" stroke="var(--teal)" strokeWidth="1.5" />
        <line x1="12" y1="6" x2="12" y2="18" stroke="var(--teal)" strokeWidth="1.5" />
      </g>
    ),
  },
  {
    symbol: "1:N",
    name: "One-to-Many",
    example: "User → Posts",
    description: "One row in table A can relate to many rows in table B. Like an author and their books — one author writes many books.",
    svgLeft: (
      <g>
        <line x1="0" y1="12" x2="36" y2="12" stroke="var(--teal)" strokeWidth="1.5" />
        <line x1="30" y1="6" x2="30" y2="18" stroke="var(--teal)" strokeWidth="1.5" />
        <line x1="24" y1="6" x2="24" y2="18" stroke="var(--teal)" strokeWidth="1.5" />
      </g>
    ),
    svgRight: (
      <g>
        <line x1="0" y1="12" x2="36" y2="12" stroke="var(--teal)" strokeWidth="1.5" />
        <line x1="6" y1="6" x2="0" y2="12" stroke="var(--teal)" strokeWidth="1.5" />
        <line x1="6" y1="18" x2="0" y2="12" stroke="var(--teal)" strokeWidth="1.5" />
        <line x1="10" y1="6" x2="10" y2="18" stroke="var(--teal)" strokeWidth="1.5" />
      </g>
    ),
  },
  {
    symbol: "M:N",
    name: "Many-to-Many",
    example: "Students ↔ Courses",
    description: "Many rows in table A relate to many rows in table B. Typically requires a join/pivot table. Like students and courses — a student takes many courses, and each course has many students.",
    svgLeft: (
      <g>
        <line x1="0" y1="12" x2="36" y2="12" stroke="var(--teal)" strokeWidth="1.5" />
        <line x1="30" y1="6" x2="36" y2="12" stroke="var(--teal)" strokeWidth="1.5" />
        <line x1="30" y1="18" x2="36" y2="12" stroke="var(--teal)" strokeWidth="1.5" />
        <line x1="26" y1="6" x2="26" y2="18" stroke="var(--teal)" strokeWidth="1.5" />
      </g>
    ),
    svgRight: (
      <g>
        <line x1="0" y1="12" x2="36" y2="12" stroke="var(--teal)" strokeWidth="1.5" />
        <line x1="6" y1="6" x2="0" y2="12" stroke="var(--teal)" strokeWidth="1.5" />
        <line x1="6" y1="18" x2="0" y2="12" stroke="var(--teal)" strokeWidth="1.5" />
        <line x1="10" y1="6" x2="10" y2="18" stroke="var(--teal)" strokeWidth="1.5" />
      </g>
    ),
  },
];

const ICON_ROWS = [
  { icon: "🔑", name: "Primary Key (PK)", description: "Uniquely identifies each row. Gold key icon." },
  { icon: "🔗", name: "Foreign Key (FK)", description: "References a primary key in another table. Purple link icon." },
  { icon: "🛡️", name: "Unique Constraint", description: "Column values must be unique across all rows." },
  { icon: "•", name: "NOT NULL", description: "Red dot indicates this column cannot be empty." },
];

export function ErdGuide({ isOpen, onClose }: ErdGuideProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed right-4 top-4 z-50 w-96 rounded-xl border border-border bg-popover shadow-2xl overflow-hidden animate-in slide-in-from-right-4 duration-200">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-teal" />
          <span className="text-sm font-semibold text-foreground">ERD Cardinality Guide</span>
        </div>
        <button
          onClick={onClose}
          className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="max-h-[70vh] overflow-y-auto p-4">
        {/* Cardinality reference */}
        <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Relationship Types (Crow's Foot Notation)
        </p>

        <div className="flex flex-col gap-3">
          {CARDINALITY_ROWS.map((row) => (
            <div key={row.symbol} className="rounded-lg border border-border bg-background p-3">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-6 items-center justify-center rounded-md bg-teal/15 px-2 font-mono text-xs font-bold text-teal">
                    {row.symbol}
                  </span>
                  <span className="text-xs font-semibold text-foreground">{row.name}</span>
                </div>
                <span className="text-[10px] text-muted-foreground font-mono">{row.example}</span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">{row.description}</p>
            </div>
          ))}
        </div>

        {/* Icon reference */}
        <p className="mt-4 mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Column Icons
        </p>

        <div className="flex flex-col gap-2">
          {ICON_ROWS.map((row) => (
            <div key={row.name} className="flex items-start gap-3 rounded-lg border border-border bg-background p-2.5">
              <span className="text-base leading-none mt-0.5 w-5 text-center shrink-0">{row.icon}</span>
              <div>
                <div className="text-xs font-semibold text-foreground">{row.name}</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">{row.description}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Visual guide tip */}
        <div className="mt-4 rounded-lg bg-teal/5 border border-teal/20 p-3">
          <p className="text-[11px] font-medium text-teal mb-1">Pro Tip: Click any relationship line</p>
          <p className="text-[11px] text-muted-foreground">
            Click a connector in the ERD to highlight related tables and see the exact foreign key constraint (e.g., <code className="font-mono bg-surface px-1 rounded">user_id → users.id</code>).
          </p>
        </div>
      </div>
    </div>
  );
}
