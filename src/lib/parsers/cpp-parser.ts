/**
 * C++ Parser - Regex-based AST extraction for C++ source files.
 *
 * Extracts:
 *  - #include directives (system <...> and local "...")
 *  - namespace declarations (with nested scope tracking)
 *  - class/struct/union definitions with inheritance (public/protected/private)
 *  - template declarations (template <typename T>)
 *  - method definitions and declarations (including const/virtual/override)
 *  - standalone functions (including operator overloads)
 *  - typedef and using alias declarations
 *  - macro definitions (#define)
 *  - global variable declarations
 *
 * Maps all extracted components into the UniversalNode schema so the
 * frontend canvas renders them identically alongside other languages.
 */

import type { Parser, SourceLanguage, ParsedModule, UniversalNode, SymbolTable } from "./types";

const CPP_EXTENSIONS = [".cpp", ".cc", ".cxx", ".hpp", ".hh", ".hxx", ".h"];

export class CppParser implements Parser {
  readonly language: SourceLanguage = "cpp";

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
      ast = this.parseCpp(source);
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

    return { path, language: "cpp", ast, source, errors, symbols };
  }

  canParse(path: string): boolean {
    const ext = "." + path.split(".").pop()?.toLowerCase();
    return CPP_EXTENSIONS.includes(ext);
  }

  getLanguage(path: string): SourceLanguage | null {
    const ext = path.split(".").pop()?.toLowerCase();
    return CPP_EXTENSIONS.includes("." + ext) ? "cpp" : null;
  }

  private parseCpp(source: string): UniversalNode {
    const lines = source.split("\n");
    const children: UniversalNode[] = [];
    const scopeStack: Array<{ name: string; indent: number; node: UniversalNode }> = [];

    let currentNamespace: string | null = null;
    let pendingTemplate: string | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      const indent = this.getIndent(line);

      if (!trimmed || trimmed.startsWith("//")) continue;
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
        children.push({
          id: `macro_${defineMatch[1]}_${i}`,
          kind: "variable_declaration",
          text: trimmed,
          start: { row: i, column: 0 },
          end: { row: i, column: trimmed.length },
          children: [],
          meta: { name: defineMatch[1], isMacro: true },
        });
        continue;
      }

      // ── template declaration ─────────────────────────────────────────
      const templateMatch = trimmed.match(/^template\s*<([^>]*)>/);
      if (templateMatch) {
        pendingTemplate = templateMatch[1];
        continue;
      }

      // ── namespace declaration ───────────────────────────────────────
      const nsMatch = trimmed.match(/^namespace\s+(\w+)\s*\{?/);
      if (nsMatch) {
        currentNamespace = nsMatch[1];
        children.push({
          id: `namespace_${currentNamespace}_${i}`,
          kind: "identifier",
          text: `namespace ${currentNamespace}`,
          start: { row: i, column: 0 },
          end: { row: i, column: trimmed.length },
          children: [],
          meta: { namespace: currentNamespace },
        });
        continue;
      }

      // ── using declaration/alias ─────────────────────────────────────
      const usingMatch = trimmed.match(/^using\s+(?:namespace\s+)?([\w:]+)(?:\s*=\s*([\w:]+))?\s*;/);
      if (usingMatch) {
        children.push({
          id: `using_${i}`,
          kind: "variable_declaration",
          text: trimmed,
          start: { row: i, column: 0 },
          end: { row: i, column: trimmed.length },
          children: [],
          meta: { name: usingMatch[1], alias: usingMatch[2], isUsing: true },
        });
        continue;
      }

      // ── class/struct/union with inheritance ──────────────────────────
      // Matches: class Foo : public Bar, protected Baz, private Qux {
      // Also matches: class Foo {  or  struct Foo {
      const classMatch = trimmed.match(
        /^(?:typedef\s+)?(class|struct|union)\s+(\w+)\s*(?::\s*([\w:,<>\s]+))?\s*\{?/
      );
      if (classMatch) {
        const kind = classMatch[1];
        const name = classMatch[2];
        const inheritance = classMatch[3]?.trim();

        const parents: string[] = [];
        if (inheritance) {
          for (const part of inheritance.split(",")) {
            const trimmedPart = part.trim();
            const accessMatch = trimmedPart.match(/^(?:public|protected|private)\s+(.+)/);
            if (accessMatch) {
              parents.push(accessMatch[1].trim());
            } else {
              parents.push(trimmedPart);
            }
          }
        }

        const node = this.createClassNode(name, kind, i, indent, parents, pendingTemplate);
        node.meta = {
          ...node.meta,
          namespace: currentNamespace,
          template: pendingTemplate,
        };
        children.push(node);
        scopeStack.push({ name, indent, node });
        pendingTemplate = null;
        continue;
      }

      // ── enum class / enum ────────────────────────────────────────────
      const enumMatch = trimmed.match(/^enum\s+(?:class\s+)?(\w+)\s*(?::\s*(\w+))?\s*\{?/);
      if (enumMatch) {
        children.push({
          id: `enum_${enumMatch[1]}_${i}`,
          kind: "class_declaration",
          text: `enum ${enumMatch[1]}`,
          start: { row: i, column: 0 },
          end: { row: i, column: trimmed.length },
          children: [],
          meta: { name: enumMatch[1], enumType: enumMatch[2], namespace: currentNamespace },
        });
        continue;
      }

      // ── Method/function definitions and declarations ────────────────
      // Matches: ReturnType ClassName::methodName(params) {  OR  ReturnType methodName(params) {
      // Handles: virtual, static, inline, const, override, noexcept, pointer return types
      const methodMatch = trimmed.match(
        /^(?:virtual\s+|static\s+|inline\s+|explicit\s+|constexpr\s+)*([\w:<>*&\s]+?)\s+(\w+)(?:::(\w+))?\s*\(([^)]*)\)\s*(?:const)?\s*(?:override)?\s*(?:noexcept)?\s*(?:\{|;|$)/
      );
      if (methodMatch) {
        const returnType = methodMatch[1].trim();
        const className = methodMatch[3];
        const methodName = methodMatch[2];
        const params = methodMatch[4];

        // Skip control-flow keywords
        if (["if", "for", "while", "switch", "return", "sizeof", "typedef", "namespace"].includes(methodName)) continue;
        if (!returnType || returnType.length === 0) continue;

        const isMethod = className !== undefined;
        const paramList = params.split(",").map((p) => p.trim()).filter(Boolean);
        const isDefinition = trimmed.includes("{") || this.isFunctionDefinitionStart(lines, i);

        const node: UniversalNode = {
          id: isMethod ? `method_${className}_${methodName}_${i}` : `func_${methodName}_${i}`,
          kind: isMethod ? "method_definition" : isDefinition ? "function_definition" : "function_declaration",
          text: isMethod ? `${returnType} ${className}::${methodName}(${params})` : `${returnType} ${methodName}(${params})`,
          start: { row: i, column: 0 },
          end: { row: i, column: trimmed.length },
          children: [],
          meta: {
            name: methodName,
            className,
            params: paramList,
            returnType,
            isVirtual: trimmed.includes("virtual"),
            isConst: trimmed.includes("const"),
            isPointer: returnType.includes("*"),
            namespace: currentNamespace,
            template: pendingTemplate,
          },
        };

        if (scopeStack.length > 0) {
          const top = scopeStack[scopeStack.length - 1];
          node.parentId = top.node.id;
          top.node.children.push(node);
        } else {
          children.push(node);
        }
        pendingTemplate = null;
        continue;
      }

      // ── Operator overloads ───────────────────────────────────────────
      const opMatch = trimmed.match(
        /^(?:virtual\s+|static\s+|inline\s+)*([\w:<>*&\s]+?)\s+operator\s*([^\s(]+)\s*\(([^)]*)\)\s*(?:const)?\s*(?:\{|;|$)/
      );
      if (opMatch) {
        const returnType = opMatch[1].trim();
        const op = opMatch[2];
        const params = opMatch[3];
        children.push({
          id: `operator_${i}`,
          kind: "method_definition",
          text: `operator${op}(${params})`,
          start: { row: i, column: 0 },
          end: { row: i, column: trimmed.length },
          children: [],
          meta: { name: `operator${op}`, operator: op, params: params.split(",").map((p) => p.trim()).filter(Boolean), returnType, namespace: currentNamespace },
        });
        continue;
      }

      // ── typedef ──────────────────────────────────────────────────────
      const typedefMatch = trimmed.match(/^typedef\s+([\w\s\*<>:]+?)\s+(\w+)\s*;?/);
      if (typedefMatch) {
        children.push({
          id: `typedef_${typedefMatch[2]}_${i}`,
          kind: "variable_declaration",
          text: trimmed,
          start: { row: i, column: 0 },
          end: { row: i, column: trimmed.length },
          children: [],
          meta: { name: typedefMatch[2], isTypedef: true, baseType: typedefMatch[1].trim() },
        });
        continue;
      }

      // Pop scope when indent decreases
      while (scopeStack.length > 0 && indent < scopeStack[scopeStack.length - 1].indent) {
        scopeStack.pop();
      }

      // ── Closing namespace brace ──────────────────────────────────────
      if (trimmed === "}" && currentNamespace && indent === 0) {
        currentNamespace = null;
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

  private isFunctionDefinitionStart(lines: string[], line: number): boolean {
    for (let i = line; i < Math.min(line + 5, lines.length); i++) {
      if (lines[i].includes("{")) return true;
      if (lines[i].trim().endsWith(";")) return false;
    }
    return false;
  }

  private createClassNode(
    name: string,
    kind: string,
    row: number,
    indent: number,
    parents: string[],
    template: string | null,
  ): UniversalNode {
    return {
      id: `class_${name}_${row}`,
      kind: "class_definition",
      text: `${kind} ${name}${parents.length > 0 ? ` : ${parents.join(", ")}` : ""}`,
      start: { row, column: indent },
      end: { row, column: indent + name.length + 6 },
      children: [],
      meta: { name, classKind: kind, parents, template },
    };
  }

  private extractSymbols(ast: UniversalNode, symbols: SymbolTable): void {
    const traverse = (node: UniversalNode) => {
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

      if (node.kind === "function_definition" || node.kind === "function_declaration" || node.kind === "method_definition") {
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
