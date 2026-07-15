/**
 * SchemaInput — Multi-dialect DDL input
 *
 * A text area that accepts database definition structures from PostgreSQL,
 * MySQL/MariaDB, or SQLite. On submit, the DDL is parsed by the universal
 * tokenizer and the resulting tables/columns/FKs are persisted as ERD
 * nodes + edges.
 */

import { useState, useCallback } from "react";
import { Database, Loader as Loader2, Sparkles, X } from "lucide-react";
import { parseDdlLexed } from "@/lib/sql-lexer";
import { detectDialect, type ParsedTable } from "@/lib/sql-tokenizer";

interface SchemaInputProps {
  onSubmit: (tables: ParsedTable[], ddl: string) => void;
  isLoading?: boolean;
  /** controlled value (for pre-seeding from the project's schema_source) */
  value?: string;
  onValueChange?: (v: string) => void;
}

export function SchemaInput({ onSubmit, isLoading, value, onValueChange }: SchemaInputProps) {
  const [internalValue, setInternalValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showInput, setShowInput] = useState(false);

  const ddl = value ?? internalValue;
  const setDdl = (v: string) => {
    if (onValueChange) onValueChange(v);
    if (file.size > 5_000_000) {
      setError("File too large. Maximum size is 5 MB.");
      e.target.value = "";
      return;
    }
    else setInternalValue(v);
  };

  const dialect = ddl.trim() ? detectDialect(ddl) : null;

  const handleSubmit = useCallback(() => {
    if (!ddl.trim() || isLoading) return;
    setError(null);
    try {
      const schema = parseDdlLexed(ddl);
      if (schema.tables.length === 0) {
        setError("No CREATE TABLE statements found. Paste a valid DDL script.");
        return;
      }
      onSubmit(schema.tables, ddl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to parse DDL");
    }
  }, [ddl, isLoading, onSubmit]);

  if (!showInput) {
    return (
      <button
        onClick={() => setShowInput(true)}
        className="flex h-9 items-center gap-2 rounded-lg border border-border bg-background px-3 text-xs font-medium text-muted-foreground transition-all hover:border-teal hover:text-teal"
      >
        <Database className="h-3.5 w-3.5" />
        Import Schema
      </button>
    );
  }

  return (
    <div className="absolute right-4 top-16 z-30 w-96 rounded-xl border border-border bg-popover/95 p-4 shadow-2xl backdrop-blur animate-slide-up">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-teal" />
          <span className="text-sm font-semibold text-foreground">Import DDL Schema</span>
        </div>
        <button
          onClick={() => setShowInput(false)}
          className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <p className="mb-2 text-[11px] text-muted-foreground">
        Paste a CREATE TABLE script. PostgreSQL, MySQL/MariaDB, and SQLite are
        auto-detected.
      </p>

      <textarea
        value={ddl}
        onChange={(e) => setDdl(e.target.value)}
        placeholder={`CREATE TABLE users (\n  id SERIAL PRIMARY KEY,\n  email TEXT UNIQUE NOT NULL\n);\n\nCREATE TABLE posts (\n  id SERIAL PRIMARY KEY,\n  user_id INTEGER REFERENCES users(id),\n  title TEXT NOT NULL\n);`}
        className="h-48 w-full resize-none rounded-lg border border-border bg-background p-3 font-mono text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/20"
        spellCheck={false}
      />

      {dialect && (
        <div className="mt-2 flex items-center gap-2 text-[11px]">
          <span className="text-muted-foreground">Detected:</span>
          <span className="rounded-full bg-teal/15 px-2 py-0.5 font-medium text-teal">
            {dialect === "postgresql" ? "PostgreSQL / Supabase" : dialect === "mysql" ? "MySQL / MariaDB" : "SQLite"}
          </span>
        </div>
      )}

      {error && (
        <p className="mt-2 text-xs text-red-500">{error}</p>
      )}

      <button
        onClick={handleSubmit}
        disabled={isLoading || !ddl.trim()}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-teal px-4 py-2 text-sm font-medium text-white transition-all hover:bg-teal/90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Sparkles className="h-4 w-4" />
        )}
        Parse & Generate ERD
      </button>
    </div>
  );
}
