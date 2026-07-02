/**
 * Universal SQL DDL Tokenizer
 *
 * A multi-dialect DDL parser that accepts database definition structures from:
 *   - Raw PostgreSQL / Supabase DDL scripts
 *   - Standard MySQL / XAMPP MariaDB dumps (ENGINE=InnoDB, AUTO_INCREMENT)
 *   - Lightweight SQLite schema dumps (INTEGER PRIMARY KEY, implicit autoincrement)
 *
 * The tokenizer is quote-agnostic: it accepts backticks (`name`), double
 * quotes ("name"), square brackets ([name]), and unquoted identifiers, and
 * normalizes them all to plain strings.
 *
 * Output: a list of ParsedTable objects with columns, primary keys, foreign
 * keys, and unique constraints — ready for the ERD layout engine and the
 * cross-engine exporter.
 */

export type SqlDialect = "postgresql" | "mysql" | "sqlite";

export interface ParsedColumn {
  name: string;
  /** normalized universal type: INTEGER | TEXT | REAL | BLOB | BOOLEAN | TIMESTAMP | JSON | UUID | NUMERIC */
  type: string;
  /** original type as written in the DDL (e.g. "VARCHAR(255)", "SERIAL", "TINYINT") */
  rawType: string;
  pk: boolean;
  fk: boolean;
  unique: boolean;
  nullable: boolean;
  /** for FK columns: the referenced table name */
  referencesTable?: string;
  /** for FK columns: the referenced column name */
  referencesColumn?: string;
  /** SQLite implicit autoincrement (INTEGER PRIMARY KEY) */
  autoIncrement?: boolean;
}

export interface ParsedTable {
  name: string;
  columns: ParsedColumn[];
  /** detected engine for MySQL dumps (e.g. "InnoDB") */
  engine?: string;
  /** detected dialect */
  dialect: SqlDialect;
}

export interface ParsedSchema {
  tables: ParsedTable[];
  dialect: SqlDialect;
}

// ─── Dialect detection ──────────────────────────────────────────────────────

/**
 * Detect the SQL dialect of a DDL script by looking for engine-specific
 * markers. Falls back to postgresql (the most permissive superset).
 */
export function detectDialect(ddl: string): SqlDialect {
  const upper = ddl.toUpperCase();
  if (/ENGINE\s*=\s*InnoDB/i.test(ddl) || /AUTO_INCREMENT/i.test(ddl)) {
    return "mysql";
  }
  // SQLite markers: AUTOINCREMENT keyword, or "INTEGER PRIMARY KEY" without SERIAL
  if (/\bAUTOINCREMENT\b/i.test(ddl) || /PRAGMA\s+/i.test(ddl)) {
    return "sqlite";
  }
  if (/SERIAL\b/i.test(ddl) || /UUID\b/i.test(ddl) || /JSONB\b/i.test(ddl)) {
    return "postgresql";
  }
  return "postgresql";
}

// ─── Identifier unquoting ───────────────────────────────────────────────────

/**
 * Strip quote/bracket wrappers from an identifier.
 *   `name`  -> name
 *   "name"  -> name
 *   [name]  -> name
 *   name    -> name
 */
function unquoteIdentifier(id: string): string {
  const trimmed = id.trim();
  if (trimmed.startsWith("`") && trimmed.endsWith("`")) {
    return trimmed.slice(1, -1);
  }
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1);
  }
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

// ─── Type normalization ────────────────────────────────────────────────────

/**
 * Map a dialect-specific type to a universal primitive.
 *   - All integer variants (INT, INTEGER, SMALLINT, BIGINT, TINYINT, SERIAL) -> INTEGER
 *   - All text variants (VARCHAR, TEXT, CHAR, CLOB) -> TEXT
 *   - All float/decimal variants (FLOAT, DOUBLE, DECIMAL, NUMERIC) -> NUMERIC
 *   - BLOB, BINARY, VARBINARY -> BLOB
 *   - BOOLEAN, BOOL -> BOOLEAN
 *   - TIMESTAMP, DATETIME, DATE, TIME -> TIMESTAMP
 *   - JSON, JSONB -> JSON
 *   - UUID -> UUID
 *   - REAL -> REAL
 */
export function normalizeType(rawType: string): string {
  const t = rawType.toUpperCase().replace(/\(.*\)$/, "").trim();

  if (/^(SERIAL|BIGSERIAL|SMALLSERIAL)$/.test(t)) return "INTEGER";
  if (/^(INT|INTEGER|SMALLINT|BIGINT|TINYINT|MEDIUMINT)$/.test(t)) return "INTEGER";
  if (/^(VARCHAR|CHAR|CHARACTER|TEXT|CLOB|LONGTEXT|MEDIUMTEXT|TINYTEXT|NCHAR|NVARCHAR)$/.test(t)) return "TEXT";
  if (/^(FLOAT|DOUBLE|DOUBLE\s+PRECISION|DECIMAL|NUMERIC|DEC)$/.test(t)) return "NUMERIC";
  if (/^(REAL)$/.test(t)) return "REAL";
  if (/^(BLOB|BINARY|VARBINARY|LONGBLOB|MEDIUMBLOB|TINYBLOB|BYTEA)$/.test(t)) return "BLOB";
  if (/^(BOOLEAN|BOOL)$/.test(t)) return "BOOLEAN";
  if (/^(TIMESTAMP|DATETIME|DATE|TIME|TIMESTAMPTZ)$/.test(t)) return "TIMESTAMP";
  if (/^(JSON|JSONB)$/.test(t)) return "JSON";
  if (/^(UUID)$/.test(t)) return "UUID";
  return t || "TEXT";
}

// ─── DDL splitter ───────────────────────────────────────────────────────────

/**
 * Split a DDL script into individual CREATE TABLE statements, preserving
 * FOREIGN KEY ... REFERENCES clauses that may appear inline or as separate
 * ALTER TABLE ... ADD CONSTRAINT statements.
 *
 * We strip comments (line and block) before splitting.
 */
function stripComments(ddl: string): string {
  return ddl
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ")
    .replace(/#[^\n]*/g, " "); // MySQL # comments
}

/**
 * Extract the table name from a CREATE TABLE statement.
 * Handles backtick, double-quote, bracket, and unquoted names.
 */
function extractTableName(stmt: string): string | null {
  const m = stmt.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([`"\[]?[\w.]+[`"\]]?)/i);
  if (!m) return null;
  return unquoteIdentifier(m[1]);
}

/**
 * Extract the column definitions block (the parenthesized body) from a
 * CREATE TABLE statement. Returns the inner text without the outer parens.
 */
function extractColumnBlock(stmt: string): string | null {
  const start = stmt.indexOf("(");
  if (start === -1) return null;
  // find the matching close paren, accounting for nesting
  let depth = 0;
  for (let i = start; i < stmt.length; i++) {
    if (stmt[i] === "(") depth++;
    else if (stmt[i] === ")") {
      depth--;
      if (depth === 0) return stmt.slice(start + 1, i);
    }
  }
  return null;
}

/**
 * Split the column block on top-level commas (ignoring commas inside
 * nested parens like VARCHAR(255) or DECIMAL(10,2)).
 */
function splitColumnDefinitions(block: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of block) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current);
  return parts;
}

// ─── Constraint detection ───────────────────────────────────────────────────

/**
 * Check whether a column definition line is actually a table-level constraint
 * (PRIMARY KEY (...), FOREIGN KEY (...), UNIQUE (...), CONSTRAINT ...).
 */
function isTableConstraint(line: string): boolean {
  const upper = line.trim().toUpperCase();
  return (
    upper.startsWith("PRIMARY KEY") ||
    upper.startsWith("FOREIGN KEY") ||
    upper.startsWith("UNIQUE") ||
    upper.startsWith("CONSTRAINT") ||
    upper.startsWith("KEY") ||
    upper.startsWith("INDEX")
  );
}

interface TableConstraint {
  type: "pk" | "fk" | "unique";
  columns: string[];
  referencesTable?: string;
  referencesColumn?: string;
}

/**
 * Parse a table-level constraint line into a structured constraint.
 */
function parseTableConstraint(line: string): TableConstraint | null {
  const trimmed = line.trim();

  // PRIMARY KEY (col1, col2)
  let m = trimmed.match(/PRIMARY\s+KEY\s*\(([^)]+)\)/i);
  if (m) {
    return {
      type: "pk",
      columns: m[1].split(",").map((c) => unquoteIdentifier(c.trim())),
    };
  }

  // FOREIGN KEY (col) REFERENCES table(col)
  m = trimmed.match(/FOREIGN\s+KEY\s*\(([^)]+)\)\s*REFERENCES\s+([`"\[]?[\w.]+[`"\]]?)\s*(?:\(([^)]+)\))?/i);
  if (m) {
    return {
      type: "fk",
      columns: m[1].split(",").map((c) => unquoteIdentifier(c.trim())),
      referencesTable: unquoteIdentifier(m[2]),
      referencesColumn: m[3] ? unquoteIdentifier(m[3].split(",")[0].trim()) : undefined,
    };
  }

  // UNIQUE (col1, col2)
  m = trimmed.match(/UNIQUE\s*\(([^)]+)\)/i);
  if (m) {
    return {
      type: "unique",
      columns: m[1].split(",").map((c) => unquoteIdentifier(c.trim())),
    };
  }

  // CONSTRAINT name FOREIGN KEY (...) REFERENCES ...
  m = trimmed.match(/CONSTRAINT\s+\S+\s+FOREIGN\s+KEY\s*\(([^)]+)\)\s*REFERENCES\s+([`"\[]?[\w.]+[`"\]]?)\s*(?:\(([^)]+)\))?/i);
  if (m) {
    return {
      type: "fk",
      columns: m[1].split(",").map((c) => unquoteIdentifier(c.trim())),
      referencesTable: unquoteIdentifier(m[2]),
      referencesColumn: m[3] ? unquoteIdentifier(m[3].split(",")[0].trim()) : undefined,
    };
  }

  return null;
}

// ─── Column parsing ─────────────────────────────────────────────────────────

/**
 * Parse a single column definition line into a ParsedColumn.
 * Returns null if the line is a table-level constraint.
 */
function parseColumn(line: string, dialect: SqlDialect): ParsedColumn | null {
  const trimmed = line.trim();
  if (!trimmed || isTableConstraint(trimmed)) return null;

  // First token is the column name (possibly quoted/bracketed)
  const nameMatch = trimmed.match(/^([`"\[]?[\w]+[`"\]]?)\s+(.*)$/);
  if (!nameMatch) return null;

  const name = unquoteIdentifier(nameMatch[1]);
  const rest = nameMatch[2].trim();

  // Extract the type — everything up to the first space or constraint keyword
  const typeMatch = rest.match(/^(\w+(?:\s*\([^)]*\))?)/);
  const rawType = typeMatch ? typeMatch[1].trim() : "TEXT";
  const type = normalizeType(rawType);

  const upperRest = rest.toUpperCase();

  const pk =
    /\bPRIMARY\s+KEY\b/i.test(rest) ||
    (dialect === "sqlite" && type === "INTEGER" && /\bPRIMARY\s+KEY\b/i.test(rest));

  const fk = /\bREFERENCES\b/i.test(rest);
  const unique = /\bUNIQUE\b/i.test(rest);
  const notNull = /\bNOT\s+NULL\b/i.test(rest);
  const nullable = !notNull && !pk; // PKs are implicitly NOT NULL

  const autoIncrement =
    /\bAUTO_INCREMENT\b/i.test(rest) ||
    /\bAUTOINCREMENT\b/i.test(rest) ||
    (dialect === "sqlite" && type === "INTEGER" && pk) ||
    (dialect === "postgresql" && /SERIAL/i.test(rawType));

  let referencesTable: string | undefined;
  let referencesColumn: string | undefined;
  if (fk) {
    const refMatch = rest.match(/REFERENCES\s+([`"\[]?[\w.]+[`"\]]?)\s*(?:\(([^)]+)\))?/i);
    if (refMatch) {
      referencesTable = unquoteIdentifier(refMatch[1]);
      referencesColumn = refMatch[2] ? unquoteIdentifier(refMatch[2].split(",")[0].trim()) : undefined;
    }
  }

  return {
    name,
    type,
    rawType,
    pk,
    fk,
    unique,
    nullable,
    referencesTable,
    referencesColumn,
    autoIncrement,
  };
}

// ─── ALTER TABLE FK extraction ─────────────────────────────────────────────

/**
 * Parse standalone ALTER TABLE ... ADD FOREIGN KEY statements that appear
 * outside CREATE TABLE (common in MySQL dumps and Supabase DDL).
 * Returns a map of table name -> FK constraint list.
 */
interface AlterFk {
  table: string;
  columns: string[];
  referencesTable: string;
  referencesColumn?: string;
}

function parseAlterTableFks(ddl: string): AlterFk[] {
  const out: AlterFk[] = [];
  const re = /ALTER\s+TABLE\s+([`"\[]?[\w.]+[`"\]]?)\s+ADD\s+(?:CONSTRAINT\s+\S+\s+)?FOREIGN\s+KEY\s*\(([^)]+)\)\s*REFERENCES\s+([`"\[]?[\w.]+[`"\]]?)\s*(?:\(([^)]+)\))?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(ddl)) !== null) {
    out.push({
      table: unquoteIdentifier(m[1]),
      columns: m[2].split(",").map((c) => unquoteIdentifier(c.trim())),
      referencesTable: unquoteIdentifier(m[3]),
      referencesColumn: m[4] ? unquoteIdentifier(m[4].split(",")[0].trim()) : undefined,
    });
  }
  return out;
}

// ─── Main parser ────────────────────────────────────────────────────────────

/**
 * Parse a DDL script from any supported dialect into a normalized schema.
 */
export function parseDdl(ddl: string): ParsedSchema {
  try {
    const dialect = detectDialect(ddl);
    const cleaned = stripComments(ddl);
    const tables: ParsedTable[] = [];

    // Split into CREATE TABLE statements
    const createRe = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[^;]+;/gi;
    const statements: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = createRe.exec(cleaned)) !== null) {
      statements.push(m[0]);
    }

    for (const stmt of statements) {
      const name = extractTableName(stmt);
      if (!name) continue;

      const block = extractColumnBlock(stmt);
      if (!block) continue;

      const parts = splitColumnDefinitions(block);
      const columns: ParsedColumn[] = [];
      const tableConstraints: TableConstraint[] = [];

      for (const part of parts) {
        const tc = parseTableConstraint(part);
        if (tc) {
          tableConstraints.push(tc);
          continue;
        }
        const col = parseColumn(part, dialect);
        if (col) columns.push(col);
      }

      // Apply table-level PK constraint
      const pkConstraint = tableConstraints.find((c) => c.type === "pk");
      if (pkConstraint) {
        for (const colName of pkConstraint.columns) {
          const col = columns.find((c) => c.name === colName);
          if (col) col.pk = true;
        }
      }

      // Apply table-level UNIQUE constraints
      for (const uc of tableConstraints.filter((c) => c.type === "unique")) {
        for (const colName of uc.columns) {
          const col = columns.find((c) => c.name === colName);
          if (col) col.unique = true;
        }
      }

      // Apply table-level FK constraints
      for (const fc of tableConstraints.filter((c) => c.type === "fk")) {
        for (const colName of fc.columns) {
          const col = columns.find((c) => c.name === colName);
          if (col) {
            col.fk = true;
            col.referencesTable = fc.referencesTable;
            col.referencesColumn = fc.referencesColumn;
          }
        }
      }

      // Detect engine for MySQL
      const engineMatch = stmt.match(/ENGINE\s*=\s*(\w+)/i);
      const engine = engineMatch ? engineMatch[1] : undefined;

      tables.push({ name, columns, engine, dialect });
    }

    // Apply standalone ALTER TABLE ... ADD FOREIGN KEY statements
    const alterFks = parseAlterTableFks(cleaned);
    for (const afk of alterFks) {
      const table = tables.find((t) => t.name === afk.table);
      if (!table) continue;
      for (const colName of afk.columns) {
        const col = table.columns.find((c) => c.name === colName);
        if (col) {
          col.fk = true;
          col.referencesTable = afk.referencesTable;
          col.referencesColumn = afk.referencesColumn;
        }
      }
    }

    return { tables, dialect };
  } catch {
    return { tables: [], dialect: detectDialect(ddl) };
  }
}

// ─── Cardinality detection ──────────────────────────────────────────────────

export type Cardinality = "one-to-one" | "one-to-many" | "many-to-many";

/**
 * Determine the cardinality of a foreign key relationship.
 *
 *   1:1 — when the FK column is marked UNIQUE.
 *   1:N — when the FK column is a standard column without a unique constraint.
 *   M:N — when the FK column is part of a junction/composite key (detected
 *         heuristically: the column name contains a pattern suggesting a
 *         many-to-many bridge table, e.g. a table with two FKs both
 *         referencing other tables). This is resolved at the schema level
 *         by detectManyToMany() rather than per-column.
 */
export function detectCardinality(
  fkColumn: ParsedColumn
): Cardinality {
  if (fkColumn.unique) return "one-to-one";
  return "one-to-many";
}

/**
 * Detect many-to-many relationships in a parsed schema.
 *
 * A junction table is one that has exactly two FK columns, both non-unique,
 * referencing two different tables. The relationship between the two
 * referenced tables is M:N through the junction.
 *
 * Returns a list of M:N relationships keyed by the two referenced tables.
 */
export interface ManyToManyRelation {
  /** the junction table name */
  junctionTable: string;
  /** one side of the M:N (alphabetically first) */
  tableA: string;
  /** other side of the M:N */
  tableB: string;
}

export function detectManyToMany(tables: ParsedTable[]): ManyToManyRelation[] {
  const out: ManyToManyRelation[] = [];
  for (const table of tables) {
    const fkCols = table.columns.filter((c) => c.fk && c.referencesTable);
    if (fkCols.length !== 2) continue;
    // both FKs must be non-unique for a true M:N junction
    if (fkCols.some((c) => c.unique)) continue;
    const refs = fkCols.map((c) => c.referencesTable!).filter((t) => t !== table.name);
    if (refs.length !== 2 || refs[0] === refs[1]) continue;
    const [a, b] = refs.sort();
    out.push({ junctionTable: table.name, tableA: a, tableB: b });
  }
  return out;
}
