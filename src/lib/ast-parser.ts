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

  try {
    const ast = acorn.parse(source, {
      ecmaVersion: "latest",
      sourceType: "module",
      locations: true,
    });

    walkAST(ast as unknown as AnyNode, source, {
      onExport: (exp) => exports.push(exp),
      onImport: (imp) => imports.push(imp),
      onCall: (call) => calls.push(call),
    });

    return { path, exports, imports, calls };
  } catch (error) {
    return {
      path,
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
  const withoutExt = filename.replace(/\.(ts|tsx|js|jsx|py|go|rs)$/, "");

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
