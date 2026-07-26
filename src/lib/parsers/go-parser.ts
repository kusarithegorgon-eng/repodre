/**
 * Go (Golang) Parser - Regex-based AST extraction for Go source files.
 *
 * Extracts package declarations, struct definitions, interface definitions,
 * functions, methods, and import statements. Maps them into the UniversalNode
 * schema.
 *
 * Go specifics recognized:
 *  - package declarations
 *  - struct definitions (type Foo struct { ... })
 *  - interface definitions (type Foo interface { ... })
 *  - function definitions (func Foo(...) { ... })
 *  - method definitions (func (r *Receiver) Foo(...) { ... })
 *  - import blocks (import ( ... )) and single imports
 */

import type { Parser, SourceLanguage, ParsedModule, UniversalNode, SymbolTable } from "./types";

const GO_EXTENSIONS = [".go"];

export class GoParser implements Parser {
  readonly language: SourceLanguage = "go";

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
      ast = this.parseGo(source);
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

    return { path, language: "go", ast, source, errors, symbols };
  }

  canParse(path: string): boolean {
    const ext = "." + path.split(".").pop()?.toLowerCase();
    return GO_EXTENSIONS.includes(ext);
  }

  getLanguage(path: string): SourceLanguage | null {
    const ext = path.split(".").pop()?.toLowerCase();
    return ext === "go" ? "go" : null;
  }

  private parseGo(source: string): UniversalNode {
    const lines = source.split("\n");
    const children: UniversalNode[] = [];
    const scopeStack: Array<{ name: string; indent: number; node: UniversalNode }> = [];

    let packageName: string | null = null;
    let inImportBlock = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      const indent = this.getIndent(line);

      if (!trimmed || trimmed.startsWith("//")) {
        continue;
      }

      // Package declaration
      const pkgMatch = trimmed.match(/^package\s+(\w+)/);
      if (pkgMatch) {
        packageName = pkgMatch[1];
        children.push({
          id: `package_${i}`,
          kind: "identifier",
          text: `package ${packageName}`,
          start: { row: i, column: 0 },
          end: { row: i, column: trimmed.length },
          children: [],
          meta: { package: packageName },
        });
        continue;
      }

      // Import block start
      if (trimmed === "import (") {
        inImportBlock = true;
        continue;
      }
      if (inImportBlock) {
        if (trimmed === ")") {
          inImportBlock = false;
          continue;
        }
        const importMatch = trimmed.match(/^"([^"]+)"/);
        if (importMatch) {
          children.push({
            id: `import_${i}`,
            kind: "import_from_statement",
            text: trimmed,
            start: { row: i, column: 0 },
            end: { row: i, column: trimmed.length },
            children: [],
            meta: { specifier: importMatch[1] },
          });
        }
        continue;
      }

      // Single import
      const singleImport = trimmed.match(/^import\s+"([^"]+)"/);
      if (singleImport) {
        children.push({
          id: `import_${i}`,
          kind: "import_from_statement",
          text: trimmed,
          start: { row: i, column: 0 },
          end: { row: i, column: trimmed.length },
          children: [],
          meta: { specifier: singleImport[1] },
        });
        continue;
      }

      // Type definition: type Foo struct { ... } or type Foo interface { ... }
      const typeMatch = trimmed.match(/^type\s+(\w+)\s+(struct|interface)\s*\{?/);
      if (typeMatch) {
        const name = typeMatch[1];
        const typeKind = typeMatch[2];
        const kind = typeKind === "struct" ? "class_definition" : "class_declaration";
        const node = this.createTypeNode(name, typeKind, i, indent);
        node.meta = { ...node.meta, typeKind, package: packageName };
        children.push(node);
        scopeStack.push({ name, indent, node });
        continue;
      }

      // Type alias: type Foo = Bar
      const aliasMatch = trimmed.match(/^type\s+(\w+)\s+=\s+([\w.]+)/);
      if (aliasMatch) {
        children.push({
          id: `typealias_${aliasMatch[1]}_${i}`,
          kind: "variable_declaration",
          text: trimmed,
          start: { row: i, column: 0 },
          end: { row: i, column: trimmed.length },
          children: [],
          meta: { name: aliasMatch[1], alias: aliasMatch[2] },
        });
        continue;
      }

      // Method definition: func (r *Receiver) MethodName(params) returnType {
      const methodMatch = trimmed.match(/^func\s+\((\w+)\s+\*?(\w+)\)\s+(\w+)\s*\(([^)]*)\)\s*([\w\[\], *]*)\s*\{?/);
      if (methodMatch) {
        const receiverName = methodMatch[1];
        const receiverType = methodMatch[2];
        const methodName = methodMatch[3];
        const params = methodMatch[4];
        const returnType = methodMatch[5].trim();
        const node = this.createMethodNode(methodName, params, i, indent, receiverType, returnType);
        node.meta = { ...node.meta, receiverName, receiverType };
        children.push(node);
        continue;
      }

      // Function definition: func FunctionName(params) returnType {
      const funcMatch = trimmed.match(/^func\s+(\w+)\s*\(([^)]*)\)\s*([\w\[\], *]*)\s*\{?/);
      if (funcMatch) {
        const name = funcMatch[1];
        const params = funcMatch[2];
        const returnType = funcMatch[3].trim();
        const node = this.createFunctionNode(name, params, i, indent, returnType);
        children.push(node);
        scopeStack.push({ name, indent, node });
        continue;
      }

      // Pop scope when indent decreases
      while (scopeStack.length > 0 && indent < scopeStack[scopeStack.length - 1].indent) {
        scopeStack.pop();
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

  private createTypeNode(name: string, kind: UniversalNode["kind"], row: number, indent: number): UniversalNode {
    return {
      id: `type_${name}_${row}`,
      kind,
      text: `type ${name}`,
      start: { row, column: indent },
      end: { row, column: indent + name.length + 5 },
      children: [],
      meta: { name },
    };
  }

  private createFunctionNode(name: string, params: string, row: number, indent: number, returnType: string): UniversalNode {
    return {
      id: `func_${name}_${row}`,
      kind: "function_definition",
      text: `func ${name}(${params})`,
      start: { row, column: indent },
      end: { row, column: indent + name.length + params.length + 7 },
      children: [],
      meta: { name, params: params.split(",").map((p) => p.trim()).filter(Boolean), returnType },
    };
  }

  private createMethodNode(name: string, params: string, row: number, indent: number, receiverType: string, returnType: string): UniversalNode {
    return {
      id: `method_${receiverType}_${name}_${row}`,
      kind: "method_definition",
      text: `func (${receiverType}) ${name}(${params})`,
      start: { row, column: indent },
      end: { row, column: indent + name.length + params.length + 10 },
      children: [],
      meta: { name, receiverType, params: params.split(",").map((p) => p.trim()).filter(Boolean), returnType },
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

      if (node.kind === "function_definition" || node.kind === "method_definition") {
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

      if (node.kind === "import_from_statement") {
        const specifier = node.meta?.specifier as string | undefined;
        if (specifier) {
          symbols.imports.push({
            specifier,
            names: [],
            isDefault: false,
            isNamespace: false,
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
