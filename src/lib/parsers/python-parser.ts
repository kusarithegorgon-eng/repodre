/**
 * Python Parser - Regex-based AST extraction for Python files.
 *
 * Provides universal AST output for Python source files using
 * pattern matching for classes, functions, decorators, and imports.
 */

import type { Parser, SourceLanguage, ParsedModule, UniversalNode, SymbolTable, Symbol, Import, ParseError } from "./types";

const PYTHON_EXTENSIONS = [".py", ".pyi"];

export class PythonParser implements Parser {
  readonly language: SourceLanguage = "python";

  parse(source: string, path: string): ParsedModule {
    const errors: ParseError[] = [];

    const ast = this.parsePython(source);
    const symbols = this.extractSymbols(ast, source);

    return { path, language: "python", ast, source, errors, symbols };
  }

  canParse(path: string): boolean {
    const ext = "." + path.split(".").pop()?.toLowerCase();
    return PYTHON_EXTENSIONS.includes(ext);
  }

  getLanguage(path: string): SourceLanguage | null {
    const ext = path.split(".").pop()?.toLowerCase();
    return ext === "py" || ext === "pyi" ? "python" : null;
  }

  private parsePython(source: string): UniversalNode {
    const lines = source.split("\n");
    const children: UniversalNode[] = [];

    // Parse top-level constructs
    let currentClass: UniversalNode | null = null;
    let currentFunction: UniversalNode | null = null;
    let currentIndent = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      const indent = this.getIndent(line);

      if (!trimmed || trimmed.startsWith("#")) continue;

      // Class definition
      const classMatch = trimmed.match(/^class\s+(\w+)(?:\s*\([^)]*\))?\s*:/);
      if (classMatch) {
        currentClass = this.createClassNode(classMatch[1], i, indent);
        children.push(currentClass);
        currentIndent = indent;
        continue;
      }

      // Function definition
      const funcMatch = trimmed.match(/^(?:async\s+)?def\s+(\w+)\s*\(([^)]*)\)\s*(?:->\s*[\w\[\], ]+)?\s*:/);
      if (funcMatch) {
        const funcNode = this.createFunctionNode(
          funcMatch[1],
          funcMatch[2],
          i,
          indent,
          trimmed.startsWith("async ")
        );

        if (currentClass && indent > currentIndent) {
          currentClass.children.push(funcNode);
          funcNode.parentId = currentClass.id;
        } else {
          children.push(funcNode);
          currentFunction = funcNode;
        }
        currentIndent = indent;
        continue;
      }

      // Import statement
      const importMatch = trimmed.match(/^(?:from\s+[\w.]+\s+)?import\s+(.+)/);
      if (importMatch) {
        children.push(this.createImportNode(importMatch[0], i));
        continue;
      }

      // Decorator
      const decoratorMatch = trimmed.match(/^@(\w+)/);
      if (decoratorMatch && (currentClass || currentFunction)) {
        const decorator = this.createDecoratorNode(decoratorMatch[1], i);
        if (currentClass) {
          currentClass.children.push(decorator);
        } else if (currentFunction) {
          currentFunction.children.push(decorator);
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

  private createClassNode(name: string, row: number, indent: number): UniversalNode {
    return {
      id: `class_${name}_${row}`,
      kind: "class_definition",
      text: `class ${name}:`,
      start: { row, column: indent },
      end: { row, column: indent + `class ${name}:`.length },
      children: [],
    };
  }

  private createFunctionNode(
    name: string,
    params: string,
    row: number,
    indent: number,
    isAsync: boolean
  ): UniversalNode {
    const text = `${isAsync ? "async " : ""}def ${name}(${params}):`;
    return {
      id: `func_${name}_${row}`,
      kind: "function_definition",
      text,
      start: { row, column: indent },
      end: { row, column: indent + text.length },
      children: [],
      meta: { async: isAsync, params: params.split(",").map((p) => p.trim()) },
    };
  }

  private createImportNode(text: string, row: number): UniversalNode {
    return {
      id: `import_${row}`,
      kind: "import_from_statement",
      text,
      start: { row, column: 0 },
      end: { row, column: text.length },
      children: [],
    };
  }

  private createDecoratorNode(name: string, row: number): UniversalNode {
    return {
      id: `decorator_${name}_${row}`,
      kind: "decorator",
      text: `@${name}`,
      start: { row, column: 0 },
      end: { row, column: 1 + name.length },
      children: [],
    };
  }

  private extractSymbols(ast: UniversalNode, source: string): SymbolTable {
    const symbols: SymbolTable = {
      exports: [],
      imports: [],
      functions: [],
      classes: [],
      variables: [],
      components: [],
    };

    const traverse = (node: UniversalNode) => {
      if (node.kind === "class_definition") {
        const name = node.text.match(/class\s+(\w+)/)?.[1];
        if (name) {
          symbols.classes.push({
            name,
            kind: "class",
            nodeId: node.id,
            exported: true, // Python modules export everything by default
          });
        }
      }

      if (node.kind === "function_definition") {
        const name = node.text.match(/def\s+(\w+)/)?.[1];
        if (name) {
          symbols.functions.push({
            name,
            kind: "function",
            nodeId: node.id,
            exported: true,
            async: node.meta?.async as boolean | undefined,
            params: node.meta?.params as string[] | undefined,
          });
        }
      }

      if (node.kind === "import_from_statement") {
        const match = node.text.match(/(?:from\s+([\w.]+)\s+)?import\s+(.+)/);
        if (match) {
          symbols.imports.push({
            specifier: match[1] ?? match[2],
            names: match[2].split(",").map((n) => n.trim()),
            isDefault: false,
            isNamespace: match[1] === undefined,
            nodeId: node.id,
          });
        }
      }

      for (const child of node.children) {
        traverse(child);
      }
    };

    traverse(ast);

    // Python doesn't have explicit exports, so all top-level is exported
    symbols.exports = [...symbols.classes, ...symbols.functions];

    return symbols;
  }
}
