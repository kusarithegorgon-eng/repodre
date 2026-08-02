/**
 * ExportSchemaButton — Cross-engine SQL export dropdown
 *
 * A dropdown button that lets the user export the active ERD canvas state
 * (tables, columns, FKs) as a download-ready SQL script targeting
 * PostgreSQL/Supabase, MySQL/XAMPP, or SQLite.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { Download, ChevronDown, Check } from "lucide-react";
import {
  exportSchema,
  downloadSchema,
  EXPORT_TARGET_LABELS,
  type ExportTarget,
  type ErdTable,
  type ErdColumn,
} from "@/lib/sql-export";
import type { Node, Edge } from "@/lib/db-client";

interface ExportSchemaButtonProps {
  nodes: Node[];
  edges: Edge[];
  disabled?: boolean;
}

export function ExportSchemaButton({ nodes, edges, disabled }: ExportSchemaButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [justExported, setJustExported] = useState<ExportTarget | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [isOpen]);

  // Build the ErdTable[] from the live canvas state
  const buildTables = useCallback((): ErdTable[] => {
    const tableNodes = nodes.filter((n) => n.workspace === "erd" && n.columns);
    return tableNodes.map((n) => ({
      name: n.tableName ?? n.label,
      columns: (n.columns ?? []).map((c): ErdColumn => ({
        name: c.name,
        type: c.type,
        pk: c.pk,
        fk: c.fk,
        unique: c.unique,
        nullable: c.nullable,
        referencesTable: undefined, // resolved from edges below
        referencesColumn: undefined,
      })),
    }));
  }, [nodes]);

  // Enrich columns with FK references from edges
  const buildTablesWithFks = useCallback((): ErdTable[] => {
    const tables = buildTables();
    const tableByName = new Map(tables.map((t) => [t.name, t]));

    for (const edge of edges) {
      if (!edge.cardinality || !edge.fromColumn || !edge.toColumn) continue;
      const fromNode = nodes.find((n) => n.id === edge.from);
      const toNode = nodes.find((n) => n.id === edge.to);
      if (!fromNode || !toNode) continue;
      const fromTable = tableByName.get(fromNode.tableName ?? fromNode.label);
      const toTableName = toNode.tableName ?? toNode.label;
      if (!fromTable) continue;
      const col = fromTable.columns.find((c) => c.name === edge.fromColumn);
      if (col) {
        col.fk = true;
        col.referencesTable = toTableName;
        col.referencesColumn = edge.toColumn;
      }
    }
    return tables;
  }, [buildTables, edges, nodes]);

  const handleExport = (target: ExportTarget) => {
    const tables = buildTablesWithFks();
    if (tables.length === 0) return;
    const sql = exportSchema(tables, { target, includeDrops: true });
    const suffix = target === "postgresql" ? "supabase" : target;
    downloadSchema(sql, `schema_export_${suffix}.sql`);
    setJustExported(target);
    setTimeout(() => setJustExported(null), 2000);
    setIsOpen(false);
  };

  const targets: ExportTarget[] = ["postgresql", "mysql", "sqlite"];
  const tableCount = nodes.filter((n) => n.workspace === "erd" && n.columns).length;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setIsOpen((v) => !v)}
        disabled={disabled || tableCount === 0}
        title={tableCount === 0 ? "Add tables to the ERD canvas first" : "Export schema as SQL"}
        className="flex h-9 items-center gap-2 rounded-lg border border-border bg-background px-3 text-xs font-medium text-foreground transition-all hover:border-teal hover:text-teal disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Download className="h-3.5 w-3.5" />
        Export Schema
        <ChevronDown className={`h-3 w-3 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full z-30 mt-2 w-56 rounded-lg border border-border bg-popover p-1.5 shadow-xl animate-fade-in">
          <p className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Target environment
          </p>
          {targets.map((target) => (
            <button
              key={target}
              onClick={() => handleExport(target)}
              className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm text-foreground transition-colors hover:bg-accent"
            >
              <span>{EXPORT_TARGET_LABELS[target]}</span>
              {justExported === target && (
                <Check className="h-3.5 w-3.5 text-teal" />
              )}
            </button>
          ))}
          <div className="my-1 h-px bg-border" />
          <p className="px-2 py-1.5 text-[10px] text-muted-foreground">
            Downloads a ready-to-run .sql file from the current canvas state.
          </p>
        </div>
      )}
    </div>
  );
}
