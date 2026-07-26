/**
 * C Parser - Regex-based AST extraction for C source files.
 *
 * Extracts:
 *  - #include directives (system <...> and local "...")
 *  - struct/union/enum definitions
 *  - typedef declarations
 *  - function declarations and definitions (with pointer return types)
 *  - macro definitions (#define)
 *  - global variable declarations
 *
 * Maps all extracted components into the UniversalNode schema so the
 * frontend canvas renders them identically alongside other languages.
 */

import type { Parser, SourceLanguage, ParsedModule, UniversalNode, SymbolTable } from "./types";

const C_EXTENSIONS = [".c", ".h"];

export class CParser implements Parser {
  readonly language: SourceLanguage = "c";

  parse(source: string, path: string): ParsedModule {
    const errors: ParsedModule["errors"] = [];
    let ast: UniversalNode;
    const symbols: SymbolTable = {
      exports: [],
      imports: [],
      functions: [],
      classes: [],
      variables: [],
      components: [],
      routes: [],
    };

    try {
      ast = this.parseC(source);
      this.extractSymbols(ast, symbols);
    } catch (err) {
      errors.push({
        message: err instanceof Error ? err.message : "Parse error",
        start: { row: 0, column: 0 },
        end: { row: 0, column: 0 },
      });
      ast = {
        id: "root",
        kind: "unhandled",
        text: source,
        start: { row: 0, column: 0 },
        end: { row: 0, column: 0 },
        children: [],
      };
    }

    return { path, language: "c", ast, source, errors, symbols };
  }

  canParse(path: string): boolean {
    const ext = "." + path.split(".").pop()?.toLowerCase();
    return C_EXTENSIONS.includes(ext);
  }

  getLanguage(path: string): SourceLanguage | null {
    const ext = path.split(".").pop()?.toLowerCase();
    return ext === "c" || ext === "h" ? "c" : null;
  }

  private parseC(source: string): UniversalNode {
    const lines = source.split("\n");
    const children: UniversalNode[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith("//")) continue;

      // Skip block comment content
      if (trimmed.startsWith("*") || trimmed.startsWith("/*")) continue;

      // ── #include directives ─────────────────────────────────────────
      const includeMatch = trimmed.match(/^#include\s+([<"])([^>"]+)[>"]/);
      if (includeMatch) {
        const isSystem = includeMatch[1] === "<";
        children.push({
          id: `include_${i}`,
          kind: "import_from_statement",
          text: trimmed,
          start: { row: i, column: 0 },
          end: { row: i, column: trimmed.length },
          children: [],
          meta: { specifier: includeMatch[2], isSystem },
        });
        continue;
      }

      // ── #define macros ──────────────────────────────────────────────
      const defineMatch = trimmed.match(/^#define\s+(\w+)(?:\(([^)]*)\))?\s+(.*)/);
      if (defineMatch) {
        const name = defineMatch[1];
        const params = defineMatch[2];
        const isFunctionMacro = params !== undefined;
        children.push({
          id: `macro_${name}_${i}`,
          kind: "variable_declaration",
          text: trimmed,
          start: { row: i, column: 0 },
          end: { row: i, column: trimmed.length },
          children: [],
          meta: { name, isMacro: true, isFunctionMacro, params: params?.split(",").map((p) => p.trim()).filter(Boolean) },
        });
        continue;
      }

      // ── typedef ─────────────────────────────────────────────────────
      const typedefMatch = trimmed.match(/^typedef\s+(?:struct\s+)?(?:union\s+)?(?:enum\s+)?([\w\s*]+?)\s+(\w+)\s*;?/);
      if (typedefMatch) {
        const aliasName = typedefMatch[2];
        const baseType = typedefMatch[1].trim();
        children.push({
          id: `typedef_${aliasName}_${i}`,
          kind: "variable_declaration",
          text: trimmed,
          start: { row: i, column: 0 },
          end: { row: i, column: trimmed.length },
          children: [],
          meta: { name: aliasName, isTypedef: true, baseType },
        });
        continue;
      }

      // ── struct/union/enum definitions ───────────────────────────────
      const structMatch = trimmed.match(/^(?:typedef\s+)?(struct|union|enum)\s+(\w+)\s*\{?/);
      if (structMatch) {
        const kind = structMatch[1];
        const name = structMatch[2];
        const fields = this.extractStructFields(lines, i);
        const nodeKind = kind === "enum" ? "class_declaration" : "class_definition";
        children.push({
          id: `${kind}_${name}_${i}`,
          kind: nodeKind,
          text: `${kind} ${name}`,
          start: { row: i, column: 0 },
          end: { row: i, column: trimmed.length },
          children: [],
          meta: { name, structKind: kind, fields },
        });
        continue;
      }

      // ── Function definitions and declarations ───────────────────────
      // Matches: returnType name(params) {  OR  returnType name(params);
      // Handles pointer return types: int*, char**, void (*)(...)
      const funcMatch = trimmed.match(
        /^(?:static\s+|inline\s+|extern\s+|const\s+)*([\w\s\*]+?)\s+(\w+)\s*\(([^)]*)\)\s*(?:\{|;|$)/
      );
      if (funcMatch) {
        const returnType = funcMatch[1].trim();
        const name = funcMatch[2];
        const params = funcMatch[3];

        // Skip control-flow keywords and common false positives
        if (["if", "for", "while", "switch", "return", "sizeof", "typedef"].includes(name)) continue;
        // Skip if the "return type" looks like a variable name (no type)
        if (!returnType || returnType.length === 0) continue;

        const isDefinition = trimmed.includes("{") || this.isFunctionDefinitionStart(lines, i);
        const paramList = params.split(",").map((p) => p.trim()).filter(Boolean);

        children.push({
          id: `func_${name}_${i}`,
          kind: isDefinition ? "function_definition" : "function_declaration",
          text: `${returnType} ${name}(${params})`,
          start: { row: i, column: 0 },
          end: { row: i, column: trimmed.length },
          children: [],
          meta: {
            name,
            params: paramList,
            returnType,
            isPointer: returnType.includes("*"),
          },
        });
        continue;
      }

      // ── Global variable declarations (heuristic) ────────────────────
      // Only treat as variable if at column 0 (global scope) and looks like a declaration
      if (this.getIndent(line) === 0) {
        const varMatch = trimmed.match(/^(?:static\s+|const\s+|extern\s+)*([\w]+)\s+(\*+)?\s*(\w+)\s*(?:\[\s*\])?\s*=\s*(.+);?$/);
        if (varMatch) {
          const type = varMatch[1];
          const name = varMatch[3];
          if (!["return", "if", "for", "while"].includes(name)) {
            children.push({
              id: `var_${name}_${i}`,
              kind: "variable_declaration",
              text: trimmed,
              start: { row: i, column: 0 },
              end: { row: i, column: trimmed.length },
              children: [],
              meta: { name, varType: type, isGlobal: true },
            });
          }
        }
      }
    }

    return {
      id: "root",
      kind: "block",
      text: source,
      start: { row: 0, column: 0 },
      end: { row: lines.length - 1, column: lines[lines.length - 1]?.length ?? 0 },
      children,
    };
  }

  private getIndent(line: string): number {
    const match = line.match(/^(\s+)/);
    return match ? match[1].length : 0;
  }

  private extractStructFields(lines: string[], structLine: number): string[] {
    const fields: string[] = [];
    for (let i = structLine + 1; i < lines.length; i++) {
      const t = lines[i].trim();
      if (t === "}" || t.startsWith("}")) break;
      if (!t || t.startsWith("//") || t.startsWith("*")) continue;
      // Extract field name from "type name;" or "type *name;"
      const fieldMatch = t.match(/^([\w\s\*]+?)\s+(\w+)\s*(?:\[\s*\d*\s*\])?\s*;?/);
      if (fieldMatch) {
        fields.push(fieldMatch[2]);
      }
    }
    return fields;
  }

  private isFunctionDefinitionStart(lines: string[], line: number): boolean {
    // Check if the next few lines contain an opening brace
    for (let i = line; i < Math.min(line + 5, lines.length); i++) {
      if (lines[i].includes("{")) return true;
      if (lines[i].trim().endsWith(";")) return false;
    }
    return false;
  }

  private extractSymbols(ast: UniversalNode, symbols: SymbolTable): void {
    const traverse = (node: UniversalNode) => {
      // Structs/unions/enums → classes
      if (node.kind === "class_definition" || node.kind === "class_declaration") {
        const name = node.meta?.name as string | undefined;
        if (name) {
          symbols.classes.push({
            name,
            kind: "class",
            nodeId: node.id,
            exported: true,
          });
        }
      }

      // Functions
      if (node.kind === "function_definition" || node.kind === "function_declaration") {
        const name = node.meta?.name as string | undefined;
        if (name) {
          symbols.functions.push({
            name,
            kind: "function",
            nodeId: node.id,
            exported: true,
            params: node.meta?.params as string[] | undefined,
            returnType: node.meta?.returnType as string | undefined,
          });
        }
      }

      // Macros and typedefs → variables
      if (node.kind === "variable_declaration") {
        const name = node.meta?.name as string | undefined;
        if (name) {
          symbols.variables.push({
            name,
            kind: "variable",
            nodeId: node.id,
            exported: true,
          });
        }
      }

      // Includes → imports
      if (node.kind === "import_from_statement") {
        const specifier = node.meta?.specifier as string | undefined;
        if (specifier) {
          symbols.imports.push({
            specifier,
            names: [],
            isDefault: false,
            isNamespace: node.meta?.isSystem as boolean | undefined ?? false,
            nodeId: node.id,
          });
        }
      }

      for (const child of node.children) {
        traverse(child);
      }
    };

    traverse(ast);
    symbols.exports = [...symbols.classes, ...symbols.functions];
  }
}
