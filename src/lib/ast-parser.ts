/**
 * Lightweight Client-Side AST Parser
 *
 * Uses acorn to parse JavaScript/TypeScript code and extract:
 * - Export declarations (function names, class names, constants)
 * - Import statements (for dependency graph construction)
 * - Function signatures and call expressions
 */

import * as acorn from "acorn";
import type { Node, Identifier, Literal, CallExpression } from "acorn";

/**
 * Strip TypeScript-specific syntax that acorn cannot parse, converting the
 * source to plain JavaScript that acorn's parser can handle.
 *
 * This is a pragmatic line-based stripper — not a full TS transform — that
 * removes:
 *   - type annotations:  `: Type` in params, variables, returns
 *   - interface/type declarations
 *   - generics: `<T>` after function/class names
 *   - `as Type` assertions
 *   - `import type` / `export type` statements
 *   - non-null assertion `!` (postfix)
 *   - enum declarations
 *   - access modifiers (public/private/protected/readonly) on class members
 *
 * It preserves all runtime code (function bodies, imports, exports, calls)
 * so the AST walker can still extract exports, imports, and call expressions.
 */
export function stripTypeScriptSyntax(source: string): string {
  const lines = source.split("\n");
  const out: string[] = [];

  for (let line of lines) {
    // Skip interface/type declarations entirely
    if (/^\s*(export\s+)?(interface|type)\s+\w+/.test(line)) {
      // Skip until closing brace for multi-line declarations
      if (!line.includes("}")) {
        // Single-line type alias: `type X = ...;`
        if (line.trim().endsWith(";") || (line.includes("=") && !line.includes("{"))) {
          continue;
        }
        // Multi-line: skip until matching brace
        let depth = (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
        if (depth <= 0) continue;
        while (depth > 0 && out.length < lines.length) {
          continue;
        }
        continue;
      }
      continue;
    }

    // Skip `import type` and `export type` statements
    if (/^\s*(import|export)\s+type\s/.test(line)) continue;

    // Skip enum declarations
    if (/^\s*(export\s+)?(const\s+)?enum\s+\w+/.test(line)) {
      // Skip until closing brace
      if (!line.includes("}")) continue;
      continue;
    }

    // Remove `as Type` assertions (but not inside strings)
    line = removeAsAssertions(line);

    // Remove access modifiers on class members
    line = line.replace(/\b(public|private|protected|readonly|override)\s+(?=(?:get\s+|set\s+)?(?:static\s+)?[\w]+(?:\s*[<(]))/g, "");

    // Remove `abstract` keyword
    line = line.replace(/\babstract\s+/g, "");

    // Remove non-null assertion `!` before `.`, `;`, `)`, `,`
    line = line.replace(/(\w|\]|\))!(?=[.;),\s])/g, "$1");

    // Remove `satisfies Type` expressions
    line = line.replace(/\bsatisfies\s+\w[\w.<>\[\]|&\s]*;?\s*$/g, "");

    out.push(line);
  }

  return out.join("\n");
}

/**
 * Remove `as Type` assertions from a line, being careful not to match
 * inside string literals.
 */
function removeAsAssertions(line: string): string {
  let result = "";
  let i = 0;
  let inString: string | null = null;

  while (i < line.length) {
    const ch = line[i];

    if (inString) {
      if (ch === "\\") {
        result += ch + (line[i + 1] ?? "");
        i += 2;
        continue;
      }
      if (ch === inString) inString = null;
      result += ch;
      i++;
      continue;
    }

    if (ch === '"' || ch === "'" || ch === "`") {
      inString = ch;
      result += ch;
      i++;
      continue;
    }

    // Check for ` as ` keyword
    if (ch === " " && line.slice(i + 1, i + 4) === "as " && i > 0) {
      // Look back to ensure this isn't a property access like `.as`
      const prevChar = result[result.length - 1];
      if (prevChar && prevChar !== "." && /\w|\)|\]|\?/.test(prevChar)) {
        // Skip ` as Type` until we hit `;`, `,`, `)`, end of line, or binary operator
        i += 4; // skip " as "
        // Skip the type expression
        let depth = 0;
        while (i < line.length) {
          const c = line[i];
          if (c === "<" || c === "(" || c === "[") depth++;
          else if (c === ">" || c === ")" || c === "]") depth--;
          else if (depth <= 0 && (c === ";" || c === "," || c === ")" || c === "\n")) break;
          else if (depth <= 0 && c === " " && i + 1 < line.length && /[&|=\n]/.test(line[i + 1])) break;
          i++;
        }
        continue;
      }
    }

    result += ch;
    i++;
  }

  return result;
}

export interface ParsedExport {
  name: string;
  type: "function" | "class" | "constant" | "default";
  line?: number;
}

export interface ParsedImport {
  source: string;
  specifiers: string[];
  line?: number;
}

export interface ParsedFunctionCall {
  name: string;
  line?: number;
}

export interface ParsedModule {
  path: string;
  source: string;
  exports: ParsedExport[];
  imports: ParsedImport[];
  calls: ParsedFunctionCall[];
  error?: string;
}

type AnyNode = Node & {
  type: string;
  start: number;
  end: number;
  [key: string]: unknown;
};

/**
 * Get line number from character position in source.
 */
function getLineNumber(source: string, position: number): number {
  const lines = source.substring(0, position).split("\n");
  return lines.length;
}

/**
 * Extract the identifier name from a node.
 */
function getIdentifierName(node: unknown): string | null {
  if (!node || typeof node !== "object") return null;
  const n = node as Record<string, unknown>;

  if (n.type === "Identifier" && typeof n.name === "string") {
    return n.name;
  }

  if (n.type === "Literal" && typeof n.value === "string") {
    return n.value;
  }

  return null;
}

/**
 * Extract import specifiers from an ImportDeclaration node.
 */
function extractImportSpecifiers(node: AnyNode): string[] {
  const specifiers: string[] = [];

  if (!node.specifiers || !Array.isArray(node.specifiers)) {
    return specifiers;
  }

  for (const spec of node.specifiers) {
    const s = spec as Record<string, unknown>;
    if (s.type === "ImportSpecifier" && s.imported) {
      const name = getIdentifierName(s.imported);
      if (name) specifiers.push(name);
    } else if (s.type === "ImportDefaultSpecifier" && s.local) {
      const name = getIdentifierName(s.local);
      if (name) specifiers.push(`default:${name}`);
    } else if (s.type === "ImportNamespaceSpecifier" && s.local) {
      const name = getIdentifierName(s.local);
      if (name) specifiers.push(`*:${name}`);
    }
  }

  return specifiers;
}

/**
 * Recursively walk the AST and extract relevant nodes.
 */
function walkAST(
  node: AnyNode,
  source: string,
  callbacks: {
    onExport?: (exp: ParsedExport) => void;
    onImport?: (imp: ParsedImport) => void;
    onCall?: (call: ParsedFunctionCall) => void;
  }
): void {
  if (!node || typeof node !== "object") return;

  // Handle Export Declarations
  if (node.type === "ExportNamedDeclaration" && node.declaration) {
    const decl = node.declaration as AnyNode;

    if (decl.type === "FunctionDeclaration" && decl.id) {
      callbacks.onExport?.({
        name: (decl.id as Identifier).name,
        type: "function",
        line: getLineNumber(source, node.start),
      });
    } else if (decl.type === "ClassDeclaration" && decl.id) {
      callbacks.onExport?.({
        name: (decl.id as Identifier).name,
        type: "class",
        line: getLineNumber(source, node.start),
      });
    } else if (decl.type === "VariableDeclaration" && Array.isArray(decl.declarations)) {
      for (const varDecl of decl.declarations) {
        const vd = varDecl as Record<string, unknown>;
        if (vd.id && typeof vd.id === "object") {
          const id = vd.id as Record<string, unknown>;
          if (id.type === "Identifier" && typeof id.name === "string") {
            callbacks.onExport?.({
              name: id.name,
              type: "constant",
              line: getLineNumber(source, node.start),
            });
          }
        }
      }
    }
  }

  // Handle Default Exports
  if (node.type === "ExportDefaultDeclaration") {
    const name = node.declaration
      ? getIdentifierName(node.declaration) || "default"
      : "default";
    callbacks.onExport?.({
      name,
      type: "default",
      line: getLineNumber(source, node.start),
    });
  }

  // Handle Export Specifiers (export { foo, bar })
  if (node.type === "ExportNamedDeclaration" && Array.isArray(node.specifiers)) {
    for (const spec of node.specifiers) {
      const s = spec as Record<string, unknown>;
      if (s.exported) {
        const name = getIdentifierName(s.exported);
        if (name) {
          callbacks.onExport?.({
            name,
            type: "constant",
            line: getLineNumber(source, node.start),
          });
        }
      }
    }
  }

  // Handle Import Declarations
  if (node.type === "ImportDeclaration") {
    const sourceValue = node.source ? (node.source as Literal).value : null;
    if (typeof sourceValue === "string") {
      callbacks.onImport?.({
        source: sourceValue,
        specifiers: extractImportSpecifiers(node),
        line: getLineNumber(source, node.start),
      });
    }
  }

  // Handle Function Calls
  if (node.type === "CallExpression") {
    const callee = node.callee as Record<string, unknown>;
    const name = getIdentifierName(callee) ||
      (callee.type === "MemberExpression" &&
       callee.property &&
       getIdentifierName(callee.property));

    if (name && typeof name === "string") {
      callbacks.onCall?.({
        name,
        line: getLineNumber(source, node.start),
      });
    }
  }

  // Recursively walk child nodes
  for (const key of Object.keys(node)) {
    const child = node[key as keyof typeof node];

    if (Array.isArray(child)) {
      for (const item of child) {
        if (item && typeof item === "object" && item.type) {
          walkAST(item as AnyNode, source, callbacks);
        }
      }
    } else if (child && typeof child === "object" && (child as AnyNode).type) {
      walkAST(child as AnyNode, source, callbacks);
    }
  }
}

/**
 * Parse a JavaScript/TypeScript source file and extract module structure.
 */
export function parseModule(source: string, path: string): ParsedModule {
  const exports: ParsedExport[] = [];
  const imports: ParsedImport[] = [];
  const calls: ParsedFunctionCall[] = [];

  // Strip TypeScript syntax before parsing with acorn (which only handles JS)
  const isTsFile = /\.(ts|tsx|mts|cts)$/.test(path);
  const jsSource = isTsFile ? stripTypeScriptSyntax(source) : source;

  try {
    const ast = acorn.parse(jsSource, {
      ecmaVersion: "latest",
      sourceType: "module",
      locations: true,
    });

    walkAST(ast as unknown as AnyNode, jsSource, {
      onExport: (exp) => exports.push(exp),
      onImport: (imp) => imports.push(imp),
      onCall: (call) => calls.push(call),
    });

    return { path, source, exports, imports, calls };
  } catch (error) {
    return {
      path,
      source,
      exports,
      imports,
      calls,
      error: error instanceof Error ? error.message : "Parse error",
    };
  }
}

/**
 * Infer file type from path for shape assignment.
 */
export function inferNodeType(path: string): "endpoint" | "middleware" | "controller" | "model" | "utility" {
  const normalized = path.toLowerCase();

  // API endpoints
  if (normalized.includes("/api/") || normalized.includes("route.") || normalized.includes("endpoint")) {
    return "endpoint";
  }

  // Middleware/guards
  if (
    normalized.includes("middleware") ||
    normalized.includes("guard") ||
    normalized.includes("auth") ||
    normalized.includes("verify") ||
    normalized.includes("validate")
  ) {
    return "middleware";
  }

  // Controllers
  if (
    normalized.includes("controller") ||
    normalized.includes("handler") ||
    normalized.includes("service") ||
    normalized.includes("process")
  ) {
    return "controller";
  }

  // Database models
  if (
    normalized.includes("model") ||
    normalized.includes("schema") ||
    normalized.includes("table") ||
    normalized.includes("db/") ||
    normalized.includes("database") ||
    normalized.includes("_table") ||
    normalized.includes("migration")
  ) {
    return "model";
  }

  return "utility";
}

/**
 * Generate a human-readable label from a file path.
 */
export function generateNodeLabel(path: string): string {
  const filename = path.split("/").pop() || path;

  // Remove common extensions
  const withoutExt = filename.replace(/\.(ts|tsx|js|jsx|py|go|rs|java|c|cpp|cc|cxx|hpp|hh|hxx|cs|h)$/, "");

  // Convert kebab/snake to space-separated
  const spaced = withoutExt.replace(/[-_]/g, " ");

  // Title case
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Generate a subtitle based on inferred type.
 */
export function generateNodeSubtype(path: string, nodeType: ReturnType<typeof inferNodeType>): string {
  const subtitles: Record<string, string> = {
    endpoint: "API Endpoint",
    middleware: "Middleware Guard",
    controller: "Route Controller",
    model: "Data Model",
    utility: "Utility Module",
  };

  return subtitles[nodeType] || "Module";
}
