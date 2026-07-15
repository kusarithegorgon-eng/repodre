import type { ColumnDef } from "./canvas-geometry";

export interface ParsedTable {
  name: string;
  columns: ColumnDef[];
}

/**
 * Parse DDL SQL into structured table definitions.
 * Handles CREATE TABLE and FOREIGN KEY / REFERENCES definitions.
 * Safely ignores non-table SQL (INSERT, DROP, SELECT, etc.).
 */
export function parseSQL(sql: string): ParsedTable[] {
  const tables: ParsedTable[] = [];
  const tableMap = new Map<string, ParsedTable>();

  // Match CREATE TABLE statements
  const createRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"]?(\w+)[`"]?\s*\(([\s\S]*?)\)\s*(?:;|$)/gi;
  let match: RegExpExecArray | null;

  while ((match = createRegex.exec(sql)) !== null) {
    const tableName = match[1];
    const body = match[2];
    const columns = parseColumns(body, tableName);
    const table: ParsedTable = { name: tableName, columns };
    tables.push(table);
    tableMap.set(tableName, table);
  }

  // Match standalone FOREIGN KEY constraints
  const fkRegex = /ALTER\s+TABLE\s+[`"]?(\w+)[`"]?\s+ADD\s+(?:CONSTRAINT\s+\w+\s+)?FOREIGN\s+KEY\s*\(\s*[`"]?(\w+)[`"]?\s*\)\s+REFERENCES\s+[`"]?(\w+)[`"]?\s*\(\s*[`"]?(\w+)[`"]?\s*\)/gi;
  while ((match = fkRegex.exec(sql)) !== null) {
    const tableName = match[1];
    const columnName = match[2];
    const refTable = match[3];
    const refColumn = match[4];
    const table = tableMap.get(tableName);
    if (table) {
      const col = table.columns.find((c) => c.name === columnName);
      if (col) {
        col.isFK = true;
        col.references = `${refTable}.${refColumn}`;
      }
    }
  }

  // Match inline REFERENCES in column definitions
  for (const table of tables) {
    for (const col of table.columns) {
      if (col.references) {
        col.isFK = true;
      }
    }
  }

  return tables;
}

function parseColumns(body: string, _tableName: string): ColumnDef[] {
  const columns: ColumnDef[] = [];
  const lines = splitColumnDefs(body);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const upper = trimmed.toUpperCase();

    // Skip constraint definitions
    if (upper.startsWith("CONSTRAINT") || upper.startsWith("PRIMARY KEY") ||
        upper.startsWith("FOREIGN KEY") || upper.startsWith("UNIQUE") ||
        upper.startsWith("CHECK") || upper.startsWith("INDEX")) {
      continue;
    }

    // Parse column: name type [constraints...]
    const colMatch = trimmed.match(/^[`"]?(\w+)[`"]?\s+(\w+(?:\s*\([^)]*\))?)\s*(.*)/);
    if (!colMatch) continue;

    const name = colMatch[1];
    const type = colMatch[2].trim();
    const constraints = colMatch[3] || "";

    const isPK = /PRIMARY\s+KEY/i.test(constraints) || /PRIMARY\s+KEY/i.test(type);
    const isFK = /REFERENCES/i.test(constraints);
    const nullable = !/NOT\s+NULL/i.test(constraints);

    let references: string | undefined;
    if (isFK) {
      const refMatch = constraints.match(/REFERENCES\s+[`"]?(\w+)[`"]?\s*\(\s*[`"]?(\w+)[`"]?\s*\)/i);
      if (refMatch) {
        references = `${refMatch[1]}.${refMatch[2]}`;
      }
    }

    columns.push({ name, type, isPK, isFK, nullable, references });
  }

  return columns;
}

function splitColumnDefs(body: string): string[] {
  const lines: string[] = [];
  let current = "";
  let depth = 0;

  for (const ch of body) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      lines.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) lines.push(current);

  return lines;
}

/**
 * Reverse-generate DDL CREATE TABLE statements from parsed tables.
 * This creates the "round-trip" workflow: import → edit → export.
 */
export function generateDDL(tables: ParsedTable[]): string {
  const lines: string[] = [];

  for (const table of tables) {
    lines.push(`CREATE TABLE "${table.name}" (`);

    const colLines: string[] = [];
    for (const col of table.columns) {
      let line = `  "${col.name}" ${col.type}`;
      if (col.isPK) line += " PRIMARY KEY";
      if (!col.nullable && !col.isPK) line += " NOT NULL";
      if (col.isFK && col.references) {
        const [refTable, refCol] = col.references.split(".");
        line += ` REFERENCES "${refTable}"("${refCol}")`;
      }
      colLines.push(line);
    }

    lines.push(colLines.join(",\n"));
    lines.push(");");
    lines.push("");
  }

  return lines.join("\n");
}
