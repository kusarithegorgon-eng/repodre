/**
 * SQL Character Lexer & Tokenizer
 *
 * A character-by-character tokenization pass that replaces the regex-based
 * string splitting in the file importer. The lexer:
 *
 *   1. Scans the DDL source one character at a time, proactively stripping
 *      SQL comment lines (line comments and block comments)
 *      and normalizing irregular tabs / multi-line whitespace into single
 *      spaces.
 *   2. Emits a standardized string token array where keywords, identifiers,
 *      type parameters, and punctuation are separate tokens.
 *   3. Groups tokens into structured records: CREATE TABLE, column
 *      definitions, data types, and FOREIGN KEY REFERENCES — regardless of
 *      whether the source uses uppercase or lowercase formatting.
 *
 * The output is a ParsedSchema (same shape as the regex-based parser) so it
 * drops in as a replacement for parseDdl().
 */

import {
  type ParsedColumn,
  type ParsedTable,
  type ParsedSchema,
  type SqlDialect,
  detectDialect,
  normalizeType,
} from "./sql-tokenizer";

// ─── Token types ────────────────────────────────────────────────────────────

export type TokenType =
  | "keyword"
  | "identifier"
  | "number"
  | "string"
  | "punctuation"
  | "operator"
  | "whitespace";

export interface Token {
  type: TokenType;
  /** the raw lexeme as it appeared in the source */
  value: string;
  /** uppercased value for case-insensitive keyword matching */
  upper: string;
  /** 1-based line number where the token starts */
  line: number;
}

// ─── Character-level lexer ──────────────────────────────────────────────────

const KEYWORDS = new Set([
  "CREATE", "TABLE", "IF", "NOT", "EXISTS", "ALTER", "ADD", "CONSTRAINT",
  "PRIMARY", "KEY", "FOREIGN", "REFERENCES", "UNIQUE", "NULL", "DEFAULT",
  "CHECK", "INDEX", "AUTO_INCREMENT", "AUTOINCREMENT", "ENGINE",
  "SELECT", "INSERT", "INTO", "UPDATE", "DELETE", "FROM", "WHERE", "SET",
  "VALUES", "AND", "OR", "ON", "CASCADE", "PRAGMA",
]);

const PUNCTUATION = new Set(["(", ")", ",", ";", "."]);

/**
 * Lex a DDL script into a flat token array, stripping comments and
 * normalizing whitespace.
 *
 * The lexer walks the source character by character:
 *   - '--' starts a line comment (skipped to end of line)
 *   - '/*' starts a block comment (skipped to closing '*\/')
 *   - '#' starts a MySQL line comment (skipped to end of line)
 *   - backtick, double-quote, and square-bracket delimiters are recognized
 *     as identifier wrappers and stripped
 *   - consecutive whitespace (including tabs and newlines) collapses to a
 *     single whitespace token
 */
export function lexSql(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let line = 1;
  const len = source.length;

  const pushToken = (type: TokenType, value: string, tokenLine: number) => {
    if (type === "whitespace") return; // skip whitespace tokens
    tokens.push({ type, value, upper: value.toUpperCase(), line: tokenLine });
  };

  while (i < len) {
    const ch = source[i];

    // ── Newline tracking ──────────────────────────────────────────────
    if (ch === "\n") {
      line++;
      i++;
      continue;
    }

    // ── Whitespace (tabs, spaces, carriage returns) ────────────────────
    if (ch === " " || ch === "\t" || ch === "\r") {
      i++;
      continue;
    }

    // ── Line comments: -- and # ────────────────────────────────────────
    if (ch === "-" && source[i + 1] === "-") {
      i += 2;
      while (i < len && source[i] !== "\n") i++;
      continue;
    }
    if (ch === "#") {
      i++;
      while (i < len && source[i] !== "\n") i++;
      continue;
    }

    // ── Block comments: /* ... */ ──────────────────────────────────────
    if (ch === "/" && source[i + 1] === "*") {
      i += 2;
      while (i < len && !(source[i] === "*" && source[i + 1] === "/")) {
        if (source[i] === "\n") line++;
        i++;
      }
      i += 2; // skip closing */
      continue;
    }

    // ── String literals: 'text' ────────────────────────────────────────
    if (ch === "'") {
      const start = i;
      const tokenLine = line;
      i++; // skip opening quote
      while (i < len && source[i] !== "'") {
        if (source[i] === "\n") line++;
        i++;
      }
      i++; // skip closing quote
      pushToken("string", source.slice(start, i), tokenLine);
      continue;
    }

    // ── Quoted identifiers: `name`, "name", [name] ────────────────────
    if (ch === "`" || ch === '"') {
      const quote = ch;
      const tokenLine = line;
      i++; // skip opening delimiter
      const start = i;
      while (i < len && source[i] !== quote) i++;
      const value = source.slice(start, i);
      i++; // skip closing delimiter
      pushToken("identifier", value, tokenLine);
      continue;
    }
    if (ch === "[") {
      const tokenLine = line;
      i++; // skip [
      const start = i;
      while (i < len && source[i] !== "]") i++;
      const value = source.slice(start, i);
      i++; // skip ]
      pushToken("identifier", value, tokenLine);
      continue;
    }

    // ── Numbers (including decimals) ───────────────────────────────────
    if (ch >= "0" && ch <= "9") {
      const tokenLine = line;
      const start = i;
      while (i < len && ((source[i] >= "0" && source[i] <= "9") || source[i] === ".")) i++;
      pushToken("number", source.slice(start, i), tokenLine);
      continue;
    }

    // ── Punctuation ────────────────────────────────────────────────────
    if (PUNCTUATION.has(ch)) {
      pushToken("punctuation", ch, line);
      i++;
      continue;
    }

    // ── Operators: = < > ! ─────────────────────────────────────────────
    if (ch === "=" || ch === "<" || ch === ">" || ch === "!") {
      pushToken("operator", ch, line);
      i++;
      continue;
    }

    // ── Identifiers and keywords ───────────────────────────────────────
    // An identifier is a sequence of letters, digits, and underscores
    // starting with a letter or underscore.
    if (ch === "_" || (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z")) {
      const tokenLine = line;
      const start = i;
      while (
        i < len &&
        (source[i] === "_" ||
         (source[i] >= "a" && source[i] <= "z") ||
         (source[i] >= "A" && source[i] <= "Z") ||
         (source[i] >= "0" && source[i] <= "9"))
      ) {
        i++;
      }
      const value = source.slice(start, i);
      const upper = value.toUpperCase();
      if (KEYWORDS.has(upper)) {
        pushToken("keyword", value, tokenLine);
      } else {
        pushToken("identifier", value, tokenLine);
      }
      continue;
    }

    // Unknown character — skip it
    i++;
  }

  return tokens;
}

// ─── Token-stream parser ────────────────────────────────────────────────────

/**
 * A simple token-stream cursor with lookahead helpers.
 */
class TokenStream {
  private pos = 0;
  constructor(private tokens: Token[]) {}

  get eof(): boolean {
    return this.pos >= this.tokens.length;
  }

  peek(offset = 0): Token | null {
    const idx = this.pos + offset;
    return idx < this.tokens.length ? this.tokens[idx] : null;
  }

  next(): Token | null {
    return this.pos < this.tokens.length ? this.tokens[this.pos++] : null;
  }

  /** Check if the next token matches a keyword (case-insensitive) */
  isKeyword(word: string, offset = 0): boolean {
    const t = this.peek(offset);
    return t !== null && t.type === "keyword" && t.upper === word.toUpperCase();
  }

  /** Check if the next token is a specific punctuation char */
  isPunct(ch: string, offset = 0): boolean {
    const t = this.peek(offset);
    return t !== null && t.type === "punctuation" && t.value === ch;
  }

  /** Consume and return the next token if it matches the keyword */
  consumeKeyword(word: string): Token | null {
    if (this.isKeyword(word)) return this.next();
    return null;
  }

  /** Consume and return the next token if it matches the punctuation */
  consumePunct(ch: string): Token | null {
    if (this.isPunct(ch)) return this.next();
    return null;
  }

  /** Expect an identifier and return its value */
  consumeIdentifier(): string | null {
    const t = this.peek();
    if (t !== null && t.type === "identifier") {
      this.next();
      return t.value;
    }
    return null;
  }

  /** Skip tokens until we hit a specific punctuation (e.g. ',' or ')') */
  skipUntilPunct(ch: string): void {
    while (!this.eof && !this.isPunct(ch)) this.next();
  }
}

/**
 * Parse a token stream into a structured schema.
 *
 * The parser walks the token array and groups tokens into:
 *   - CREATE TABLE statements (with table name)
 *   - Column definitions (name, type, constraints)
 *   - Table-level constraints (PRIMARY KEY, FOREIGN KEY, UNIQUE)
 *   - ALTER TABLE ... ADD FOREIGN KEY statements
 */
export function parseTokens(tokens: Token[], dialect: SqlDialect): ParsedSchema {
  const stream = new TokenStream(tokens);
  const tables: ParsedTable[] = [];

  while (!stream.eof) {
    // ── CREATE TABLE ─────────────────────────────────────────────────
    if (stream.isKeyword("CREATE") && stream.isKeyword("TABLE", 1)) {
      const table = parseCreateTable(stream, dialect);
      if (table) tables.push(table);
      continue;
    }

    // ── ALTER TABLE ... ADD FOREIGN KEY ──────────────────────────────
    if (stream.isKeyword("ALTER") && stream.isKeyword("TABLE", 1)) {
      parseAlterTableFk(stream, tables);
      continue;
    }

    // Skip unrecognized tokens
    stream.next();
  }

  return { tables, dialect };
}

/**
 * Parse a CREATE TABLE statement from the token stream.
 */
function parseCreateTable(stream: TokenStream, dialect: SqlDialect): ParsedTable | null {
  stream.consumeKeyword("CREATE");
  stream.consumeKeyword("TABLE");

  // Optional IF NOT EXISTS
  if (stream.isKeyword("IF") && stream.isKeyword("NOT", 1) && stream.isKeyword("EXISTS", 2)) {
    stream.next(); stream.next(); stream.next();
  }

  // Table name
  const name = stream.consumeIdentifier();
  if (!name) return null;

  // Expect opening paren
  if (!stream.consumePunct("(")) return null;

  const columns: ParsedColumn[] = [];
  const tableConstraints: Array<{
    type: "pk" | "fk" | "unique";
    columns: string[];
    referencesTable?: string;
    referencesColumn?: string;
  }> = [];

  // Parse column definitions and table-level constraints until closing paren
  while (!stream.eof && !stream.isPunct(")")) {
    // Skip leading commas
    if (stream.consumePunct(",")) continue;

    // Check if this is a table-level constraint
    if (stream.isKeyword("PRIMARY") || stream.isKeyword("FOREIGN") ||
        stream.isKeyword("UNIQUE") || stream.isKeyword("CONSTRAINT") ||
        stream.isKeyword("KEY") || stream.isKeyword("INDEX")) {
      const tc = parseTableConstraintTokens(stream);
      if (tc) tableConstraints.push(tc);
      continue;
    }

    // Otherwise it's a column definition
    const col = parseColumnTokens(stream, dialect);
    if (col) columns.push(col);
  }

  // Consume closing paren
  stream.consumePunct(")");

  // Optional ENGINE=... (MySQL)
  let engine: string | undefined;
  if (stream.isKeyword("ENGINE")) {
    stream.next();
    stream.consumePunct("=") || stream.next(); // skip = or just the next token
    const engineTok = stream.next();
    if (engineTok) engine = engineTok.value;
  }

  // Consume trailing semicolon
  stream.consumePunct(";");

  // Apply table-level constraints to columns
  applyTableConstraints(columns, tableConstraints);

  return { name, columns, engine, dialect };
}

/**
 * Parse a single column definition from the token stream.
 */
function parseColumnTokens(stream: TokenStream, dialect: SqlDialect): ParsedColumn | null {
  const name = stream.consumeIdentifier();
  if (!name) {
    stream.next(); // skip unrecognized token
    return null;
  }

  // Data type — may be a single identifier or identifier with parameters
  const typeTok = stream.peek();
  if (!typeTok || typeTok.type !== "identifier") {
    return null;
  }
  stream.next();
  let rawType = typeTok.value;

  // Type parameters: (255) or (10, 2)
  if (stream.isPunct("(")) {
    stream.next(); // consume (
    let paramStr = "(";
    while (!stream.eof && !stream.isPunct(")")) {
      const t = stream.next();
      if (t) paramStr += t.value;
    }
    stream.consumePunct(")");
    paramStr += ")";
    rawType += paramStr;
  }

  const type = normalizeType(rawType);

  // Scan column-level constraints until we hit a comma, closing paren, or
  // the start of a new table-level constraint keyword.
  let pk = false;
  let fk = false;
  let unique = false;
  let nullable = true;
  let autoIncrement = false;
  let referencesTable: string | undefined;
  let referencesColumn: string | undefined;

  while (!stream.eof && !stream.isPunct(",") && !stream.isPunct(")")) {
    if (stream.isKeyword("PRIMARY") && stream.isKeyword("KEY", 1)) {
      pk = true;
      stream.next(); stream.next();
    } else if (stream.isKeyword("NOT") && stream.isKeyword("NULL", 1)) {
      nullable = false;
      stream.next(); stream.next();
    } else if (stream.isKeyword("NULL")) {
      stream.next();
    } else if (stream.isKeyword("UNIQUE")) {
      unique = true;
      stream.next();
    } else if (stream.isKeyword("REFERENCES")) {
      fk = true;
      stream.next();
      const refTable = stream.consumeIdentifier();
      if (refTable) {
        referencesTable = refTable;
        // Optional (column)
        if (stream.isPunct("(")) {
          stream.next();
          const refCol = stream.consumeIdentifier();
          if (refCol) referencesColumn = refCol;
          stream.skipUntilPunct(")");
          stream.consumePunct(")");
        }
      }
    } else if (stream.isKeyword("AUTO_INCREMENT") || stream.isKeyword("AUTOINCREMENT")) {
      autoIncrement = true;
      stream.next();
    } else if (stream.isKeyword("DEFAULT")) {
      stream.next();
      // Skip the default value (could be a string, number, or keyword)
      const t = stream.peek();
      if (t) {
        stream.next();
        // If it's a function call like DEFAULT now(), skip the parens
        if (stream.isPunct("(")) {
          stream.skipUntilPunct(")");
          stream.consumePunct(")");
        }
      }
    } else {
      // Skip unrecognized tokens (CHECK constraints, COLLATE, etc.)
      stream.next();
    }
  }

  // PKs are implicitly NOT NULL
  if (pk) nullable = false;

  // SQLite implicit autoincrement for INTEGER PRIMARY KEY
  if (dialect === "sqlite" && type === "INTEGER" && pk) {
    autoIncrement = true;
  }
  // PostgreSQL SERIAL implies autoincrement
  if (dialect === "postgresql" && /SERIAL/i.test(rawType)) {
    autoIncrement = true;
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

/**
 * Parse a table-level constraint from the token stream.
 */
function parseTableConstraintTokens(stream: TokenStream): {
  type: "pk" | "fk" | "unique";
  columns: string[];
  referencesTable?: string;
  referencesColumn?: string;
} | null {
  // Optional CONSTRAINT name
  if (stream.isKeyword("CONSTRAINT")) {
    stream.next();
    stream.consumeIdentifier(); // constraint name
  }

  // PRIMARY KEY (col1, col2)
  if (stream.isKeyword("PRIMARY") && stream.isKeyword("KEY", 1)) {
    stream.next(); stream.next();
    if (!stream.consumePunct("(")) return null;
    const cols: string[] = [];
    while (!stream.eof && !stream.isPunct(")")) {
      if (stream.consumePunct(",")) continue;
      const id = stream.consumeIdentifier();
      if (id) cols.push(id);
      else stream.next();
    }
    stream.consumePunct(")");
    return { type: "pk", columns: cols };
  }

  // FOREIGN KEY (col) REFERENCES table(col)
  if (stream.isKeyword("FOREIGN") && stream.isKeyword("KEY", 1)) {
    stream.next(); stream.next();
    if (!stream.consumePunct("(")) return null;
    const cols: string[] = [];
    while (!stream.eof && !stream.isPunct(")")) {
      if (stream.consumePunct(",")) continue;
      const id = stream.consumeIdentifier();
      if (id) cols.push(id);
      else stream.next();
    }
    stream.consumePunct(")");

    let referencesTable: string | undefined;
    let referencesColumn: string | undefined;

    if (stream.isKeyword("REFERENCES")) {
      stream.next();
      const refTable = stream.consumeIdentifier();
      if (refTable) {
        referencesTable = refTable;
        if (stream.isPunct("(")) {
          stream.next();
          const refCol = stream.consumeIdentifier();
          if (refCol) referencesColumn = refCol;
          stream.skipUntilPunct(")");
          stream.consumePunct(")");
        }
      }
    }

    return { type: "fk", columns: cols, referencesTable, referencesColumn };
  }

  // UNIQUE (col1, col2)
  if (stream.isKeyword("UNIQUE")) {
    stream.next();
    if (!stream.consumePunct("(")) return null;
    const cols: string[] = [];
    while (!stream.eof && !stream.isPunct(")")) {
      if (stream.consumePunct(",")) continue;
      const id = stream.consumeIdentifier();
      if (id) cols.push(id);
      else stream.next();
    }
    stream.consumePunct(")");
    return { type: "unique", columns: cols };
  }

  // KEY / INDEX — skip (MySQL secondary indexes)
  if (stream.isKeyword("KEY") || stream.isKeyword("INDEX")) {
    stream.next();
    // Skip the index name and column list
    stream.consumeIdentifier();
    if (stream.isPunct("(")) {
      stream.skipUntilPunct(")");
      stream.consumePunct(")");
    }
    return null;
  }

  return null;
}

/**
 * Apply table-level constraints to the column list.
 */
function applyTableConstraints(
  columns: ParsedColumn[],
  constraints: Array<{
    type: "pk" | "fk" | "unique";
    columns: string[];
    referencesTable?: string;
    referencesColumn?: string;
  }>,
): void {
  for (const c of constraints) {
    for (const colName of c.columns) {
      const col = columns.find((x) => x.name === colName);
      if (!col) continue;
      if (c.type === "pk") col.pk = true;
      if (c.type === "unique") col.unique = true;
      if (c.type === "fk") {
        col.fk = true;
        col.referencesTable = c.referencesTable;
        col.referencesColumn = c.referencesColumn;
      }
    }
  }
}

/**
 * Parse ALTER TABLE ... ADD FOREIGN KEY from the token stream and apply
 * it to the matching table in the tables list.
 */
function parseAlterTableFk(stream: TokenStream, tables: ParsedTable[]): void {
  stream.consumeKeyword("ALTER");
  stream.consumeKeyword("TABLE");

  const tableName = stream.consumeIdentifier();
  if (!tableName) return;

  // ADD [CONSTRAINT name] FOREIGN KEY
  if (!stream.isKeyword("ADD")) return;
  stream.next();

  // Optional CONSTRAINT name
  if (stream.isKeyword("CONSTRAINT")) {
    stream.next();
    stream.consumeIdentifier();
  }

  if (!stream.isKeyword("FOREIGN") || !stream.isKeyword("KEY", 1)) return;
  stream.next(); stream.next();

  if (!stream.consumePunct("(")) return;
  const cols: string[] = [];
  while (!stream.eof && !stream.isPunct(")")) {
    if (stream.consumePunct(",")) continue;
    const id = stream.consumeIdentifier();
    if (id) cols.push(id);
    else stream.next();
  }
  stream.consumePunct(")");

  let referencesTable: string | undefined;
  let referencesColumn: string | undefined;

  if (stream.isKeyword("REFERENCES")) {
    stream.next();
    const refTable = stream.consumeIdentifier();
    if (refTable) {
      referencesTable = refTable;
      if (stream.isPunct("(")) {
        stream.next();
        const refCol = stream.consumeIdentifier();
        if (refCol) referencesColumn = refCol;
        stream.skipUntilPunct(")");
        stream.consumePunct(")");
      }
    }
  }

  // Apply to the matching table
  const table = tables.find((t) => t.name === tableName);
  if (!table) return;
  for (const colName of cols) {
    const col = table.columns.find((c) => c.name === colName);
    if (col) {
      col.fk = true;
      col.referencesTable = referencesTable;
      col.referencesColumn = referencesColumn;
    }
  }
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Parse a DDL script using the character-level lexer + token-stream parser.
 *
 * This is the drop-in replacement for the regex-based parseDdl(). It produces
 * the same ParsedSchema shape but uses character-by-character tokenization
 * instead of regex string splitting, making it robust against irregular
 * whitespace, mixed-case keywords, and embedded comments.
 */
export function parseDdlLexed(ddl: string): ParsedSchema {
  try {
    const dialect = detectDialect(ddl);
    const tokens = lexSql(ddl);
    return parseTokens(tokens, dialect);
  } catch {
    return { tables: [], dialect: detectDialect(ddl) };
  }
}
