/**
 * AST Tokenizer Inspector — Lexical Token Stream Generator
 *
 * Parses source code text into a sequential stream of lexical tokens
 * classified into primitive compiler categories: Keywords, Identifiers,
 * Operators, Literals, and Scopes.
 */

export type TokenType =
  | "keyword"
  | "identifier"
  | "operator"
  | "literal"
  | "string"
  | "number"
  | "punctuation"
  | "comment"
  | "scope-open"
  | "scope-close"
  | "whitespace";

export interface Token {
  type: TokenType;
  value: string;
  line: number;
  column: number;
  index: number;
}

export interface TokenStream {
  tokens: Token[];
  stats: {
    keywords: number;
    identifiers: number;
    operators: number;
    literals: number;
    strings: number;
    numbers: number;
    punctuation: number;
    comments: number;
    scopes: number;
  };
}

const JS_KEYWORDS = new Set([
  "const", "let", "var", "function", "return", "if", "else", "for", "while",
  "do", "switch", "case", "break", "continue", "new", "class", "extends",
  "import", "export", "from", "default", "async", "await", "try", "catch",
  "finally", "throw", "typeof", "instanceof", "in", "of", "delete", "void",
  "yield", "static", "get", "set", "public", "private", "protected", "readonly",
  "interface", "type", "enum", "namespace", "module", "declare", "abstract",
  "implements", "as", "is", "satisfies", "infer", "keyof", "unique",
]);

const SQL_KEYWORDS = new Set([
  "CREATE", "TABLE", "ALTER", "DROP", "SELECT", "INSERT", "UPDATE", "DELETE",
  "FROM", "WHERE", "JOIN", "INNER", "LEFT", "RIGHT", "OUTER", "ON", "AND",
  "OR", "NOT", "NULL", "PRIMARY", "KEY", "FOREIGN", "REFERENCES", "UNIQUE",
  "DEFAULT", "CHECK", "CONSTRAINT", "INDEX", "VIEW", "DATABASE", "SCHEMA",
  "GRANT", "REVOKE", "COMMIT", "ROLLBACK", "BEGIN", "END", "IF", "ELSE",
  "THEN", "CASE", "WHEN", "AS", "ORDER", "BY", "ASC", "DESC", "LIMIT",
  "OFFSET", "GROUP", "HAVING", "UNION", "ALL", "DISTINCT", "INTO", "VALUES",
  "SET", "RETURNS", "FUNCTION", "PROCEDURE", "TRIGGER", "DECLARE", "LANGUAGE",
  "SECURITY", "DEFINER", "INVOKER", "RETURN", "EXECUTE", "EXEC",
]);

const OPERATORS = new Set([
  "+", "-", "*", "/", "%", "=", "==", "===", "!=", "!==", "<", ">", "<=", ">=",
  "&&", "||", "!", "?", ":", "=>", "++", "--", "+=", "-=", "*=", "/=", "%=",
  "&", "|", "^", "~", "<<", ">>", ">>>", "&=", "|=", "^=", "<<=", ">>=",
  "??", "?.", "**",
]);

const PUNCTUATION = new Set([
  "(", ")", "{", "}", "[", "]", ";", ",", ".", "...", "@", "#", "$", "\\",
]);

function isKeyword(word: string, isSql: boolean): boolean {
  if (isSql) return SQL_KEYWORDS.has(word.toUpperCase());
  return JS_KEYWORDS.has(word);
}

function detectLanguage(source: string): "javascript" | "sql" {
  const trimmed = source.trim().toLowerCase();
  if (
    /^\s*(create\s+table|select\s+|insert\s+|update\s+|delete\s+|alter\s+|drop\s+)/i.test(source.trim()) ||
    trimmed.includes("primary key") ||
    trimmed.includes("foreign key") ||
    trimmed.includes("references")
  ) {
    return "sql";
  }
  return "javascript";
}

export function tokenize(source: string): TokenStream {
  try {
    return tokenizeInternal(source);
  } catch {
    return { tokens: [], stats: { keywords: 0, identifiers: 0, operators: 0, literals: 0, strings: 0, numbers: 0, punctuation: 0, comments: 0, scopes: 0 } };
  }
}

function tokenizeInternal(source: string): TokenStream {
  const language = detectLanguage(source);
  const isSql = language === "sql";
  const tokens: Token[] = [];
  let index = 0;
  let line = 1;
  let column = 1;

  while (index < source.length) {
    const char = source[index];
    const startLine = line;
    const startCol = column;

    // Whitespace
    if (/\s/.test(char)) {
      let value = "";
      while (index < source.length && /\s/.test(source[index])) {
        if (source[index] === "\n") {
          line++;
          column = 1;
        } else {
          column++;
        }
        value += source[index];
        index++;
      }
      tokens.push({ type: "whitespace", value, line: startLine, column: startCol, index: tokens.length });
      continue;
    }

    // Comments (single-line)
    if (char === "/" && source[index + 1] === "/") {
      let value = "";
      while (index < source.length && source[index] !== "\n") {
        value += source[index];
        index++;
        column++;
      }
      tokens.push({ type: "comment", value, line: startLine, column: startCol, index: tokens.length });
      continue;
    }

    // Comments (multi-line)
    if (char === "/" && source[index + 1] === "*") {
      let value = "";
      while (index < source.length && !(source[index] === "*" && source[index + 1] === "/")) {
        if (source[index] === "\n") {
          line++;
          column = 1;
        } else {
          column++;
        }
        value += source[index];
        index++;
      }
      if (index < source.length) {
        value += "*/";
        index += 2;
        column += 2;
      }
      tokens.push({ type: "comment", value, line: startLine, column: startCol, index: tokens.length });
      continue;
    }

    // SQL comments (-- ...)
    if (isSql && char === "-" && source[index + 1] === "-") {
      let value = "";
      while (index < source.length && source[index] !== "\n") {
        value += source[index];
        index++;
        column++;
      }
      tokens.push({ type: "comment", value, line: startLine, column: startCol, index: tokens.length });
      continue;
    }

    // Strings (double quotes)
    if (char === '"') {
      let value = '"';
      index++;
      column++;
      while (index < source.length && source[index] !== '"') {
        if (source[index] === "\\" && index + 1 < source.length) {
          value += source[index] + source[index + 1];
          index += 2;
          column += 2;
        } else {
          if (source[index] === "\n") {
            line++;
            column = 1;
          } else {
            column++;
          }
          value += source[index];
          index++;
        }
      }
      if (index < source.length) {
        value += '"';
        index++;
        column++;
      }
      tokens.push({ type: "string", value, line: startLine, column: startCol, index: tokens.length });
      continue;
    }

    // Strings (single quotes)
    if (char === "'") {
      let value = "'";
      index++;
      column++;
      while (index < source.length && source[index] !== "'") {
        if (source[index] === "\\" && index + 1 < source.length) {
          value += source[index] + source[index + 1];
          index += 2;
          column += 2;
        } else {
          if (source[index] === "\n") {
            line++;
            column = 1;
          } else {
            column++;
          }
          value += source[index];
          index++;
        }
      }
      if (index < source.length) {
        value += "'";
        index++;
        column++;
      }
      tokens.push({ type: "string", value, line: startLine, column: startCol, index: tokens.length });
      continue;
    }

    // Template literals
    if (char === "`") {
      let value = "`";
      index++;
      column++;
      while (index < source.length && source[index] !== "`") {
        if (source[index] === "\\" && index + 1 < source.length) {
          value += source[index] + source[index + 1];
          index += 2;
          column += 2;
        } else {
          if (source[index] === "\n") {
            line++;
            column = 1;
          } else {
            column++;
          }
          value += source[index];
          index++;
        }
      }
      if (index < source.length) {
        value += "`";
        index++;
        column++;
      }
      tokens.push({ type: "string", value, line: startLine, column: startCol, index: tokens.length });
      continue;
    }

    // Numbers
    if (/\d/.test(char) || (char === "." && /\d/.test(source[index + 1]))) {
      let value = "";
      while (index < source.length && /[\d.eExXa-fA-F_]/.test(source[index])) {
        value += source[index];
        index++;
        column++;
      }
      tokens.push({ type: "number", value, line: startLine, column: startCol, index: tokens.length });
      continue;
    }

    // Identifiers and keywords
    if (/[a-zA-Z_$]/.test(char)) {
      let value = "";
      while (index < source.length && /[a-zA-Z0-9_$]/.test(source[index])) {
        value += source[index];
        index++;
        column++;
      }
      if (isKeyword(value, isSql)) {
        tokens.push({ type: "keyword", value, line: startLine, column: startCol, index: tokens.length });
      } else {
        tokens.push({ type: "identifier", value, line: startLine, column: startCol, index: tokens.length });
      }
      continue;
    }

    // Scope open/close
    if (char === "{") {
      tokens.push({ type: "scope-open", value: char, line: startLine, column: startCol, index: tokens.length });
      index++;
      column++;
      continue;
    }
    if (char === "}") {
      tokens.push({ type: "scope-close", value: char, line: startLine, column: startCol, index: tokens.length });
      index++;
      column++;
      continue;
    }

    // Multi-character operators
    let matched = false;
    for (const op of ["===", "!==", ">>>", "**=", ">>=", "<<=", "&&=", "||=", "??=", "==", "!=", "<=", ">=", "&&", "||", "=>", "++", "--", "+=", "-=", "*=", "/=", "%=", "&=", "|=", "^=", "<<", ">>", "??", "?.", "...", "**"]) {
      if (source.slice(index, index + op.length) === op) {
        tokens.push({ type: "operator", value: op, line: startLine, column: startCol, index: tokens.length });
        index += op.length;
        column += op.length;
        matched = true;
        break;
      }
    }
    if (matched) continue;

    // Single-character operators
    if (OPERATORS.has(char)) {
      tokens.push({ type: "operator", value: char, line: startLine, column: startCol, index: tokens.length });
      index++;
      column++;
      continue;
    }

    // Punctuation
    if (PUNCTUATION.has(char)) {
      tokens.push({ type: "punctuation", value: char, line: startLine, column: startCol, index: tokens.length });
      index++;
      column++;
      continue;
    }

    // Unknown character — skip
    index++;
    column++;
  }

  const stats = {
    keywords: tokens.filter((t) => t.type === "keyword").length,
    identifiers: tokens.filter((t) => t.type === "identifier").length,
    operators: tokens.filter((t) => t.type === "operator").length,
    literals: tokens.filter((t) => t.type === "literal").length,
    strings: tokens.filter((t) => t.type === "string").length,
    numbers: tokens.filter((t) => t.type === "number").length,
    punctuation: tokens.filter((t) => t.type === "punctuation").length,
    comments: tokens.filter((t) => t.type === "comment").length,
    scopes: tokens.filter((t) => t.type === "scope-open" || t.type === "scope-close").length,
  };

  return { tokens, stats };
}

export const TOKEN_COLORS: Record<TokenType, string> = {
  keyword: "text-purple-400",
  identifier: "text-blue-300",
  operator: "text-amber-400",
  literal: "text-green-400",
  string: "text-green-300",
  number: "text-orange-400",
  punctuation: "text-gray-400",
  comment: "text-gray-500 italic",
  "scope-open": "text-yellow-400 font-bold",
  "scope-close": "text-yellow-400 font-bold",
  whitespace: "",
};

export const TOKEN_LABELS: Record<TokenType, string> = {
  keyword: "Keyword",
  identifier: "Identifier",
  operator: "Operator",
  literal: "Literal",
  string: "String",
  number: "Number",
  punctuation: "Punctuation",
  comment: "Comment",
  "scope-open": "Scope Open",
  "scope-close": "Scope Close",
  whitespace: "Whitespace",
};
