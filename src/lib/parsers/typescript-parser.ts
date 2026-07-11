/**
 * TypeScript/JavaScript Parser - Uses acorn for browser compatibility.
 *
 * Provides tree-sitter-like AST output for TypeScript and JavaScript files
 * using acorn (already in dependencies) with enhanced JSX support.
 */

import * as acorn from "acorn";
import type { Parser, SourceLanguage, ParsedModule, UniversalNode, SymbolTable, Symbol, Import } from "./types";

const TYPESCRIPT_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx"];

export class TypeScriptParser implements Parser {
  readonly language: SourceLanguage = "typescript";

  parse(source: string, path: string): ParsedModule {
    const language = this.getLanguage(path) ?? "typescript";
    const errors: this["parse"][""]["errors"] = [];

    let ast: UniversalNode;
    const symbols: SymbolTable = {
      exports: [],
      imports: [],
      functions: [],
      classes: [],
      variables: [],
      components: [],
    };

    try {
      const program = acorn.parse(source, {
        ecmaVersion: "latest",
        sourceType: "module",
        locations: true,
        onComment: [],
      });

      ast = this.convertNode(program as acorn.Node, source, "root");
      this.extractSymbols(ast, symbols, language);
    } catch (err) {
      (errors as ParseError[]).push({
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

    return { path, language, ast, source, errors, symbols };
  }

  canParse(path: string): boolean {
    const ext = "." + path.split(".").pop()?.toLowerCase();
    return TYPESCRIPT_EXTENSIONS.includes(ext);
  }

  getLanguage(path: string): SourceLanguage | null {
    const ext = path.split(".").pop()?.toLowerCase();
    switch (ext) {
      case "ts":
        return "typescript";
      case "tsx":
        return "tsx";
      case "jsx":
        return "javascript";
      case "js":
        return "javascript";
      default:
        return null;
    }
  }

  private convertNode(node: acorn.Node, source: string, parentId?: string): UniversalNode {
    const id = `node_${node.start}_${node.end}`;
    const kind = this.mapKind(node.type);

    const text = source.slice(node.start, node.end);

    const universalNode: UniversalNode = {
      id,
      kind,
      text,
      start: {
        row: node.loc?.start.line ?? 0,
        column: node.loc?.start.column ?? 0,
        byte: node.start,
      },
      end: {
        row: node.loc?.end.line ?? 0,
        column: node.loc?.end.column ?? 0,
        byte: node.end,
      },
      children: [],
      parentId,
      meta: { type: node.type },
    };

    // Recursively process children
    const children = this.extractChildren(node as Record<string, unknown>);
    for (const child of children) {
      if (child && typeof child === "object" && "type" in child) {
        const childNode = this.convertNode(child as acorn.Node, source, id);
        universalNode.children.push(childNode);
      }
    }

    return universalNode;
  }

  private extractChildren(node: Record<string, unknown>): acorn.Node[] {
    const children: acorn.Node[] = [];

    for (const key of Object.keys(node)) {
      if (key === "type" || key === "start" || key === "end" || key === "loc") continue;

      const value = node[key];
      if (Array.isArray(value)) {
        for (const item of value) {
          if (item && typeof item === "object" && "type" in item) {
            children.push(item as acorn.Node);
          }
        }
      } else if (value && typeof value === "object" && "type" in value) {
        children.push(value as acorn.Node);
      }
    }

    return children;
  }

  private mapKind(type: string): UniversalNode["kind"] {
    const mapping: Record<string, UniversalNode["kind"]> = {
      FunctionDeclaration: "function_declaration",
      FunctionExpression: "function_expression",
      ArrowFunctionExpression: "arrow_function",
      ClassDeclaration: "class_declaration",
      MethodDefinition: "method_definition",
      ImportDeclaration: "import_statement",
      ExportNamedDeclaration: "export_statement",
      ExportDefaultDeclaration: "export_statement",
      VariableDeclaration: "variable_declaration",
      CallExpression: "call_expression",
      MemberExpression: "member_expression",
      Identifier: "identifier",
      Literal: "string",
      JSXElement: "jsx_element",
      JSXFragment: "jsx_element",
      JSXSelfClosingElement: "jsx_self_closing_element",
      ExpressionStatement: "expression_statement",
      BlockStatement: "block",
      IfStatement: "if_statement",
      ForStatement: "for_statement",
      WhileStatement: "while_statement",
      TryStatement: "try_statement",
      ReturnStatement: "return_statement",
      AwaitExpression: "await_expression",
      ThrowStatement: "throw_statement",
    };
    return mapping[type] ?? "unhandled";
  }

  private extractSymbols(ast: UniversalNode, symbols: SymbolTable, language: SourceLanguage): void {
    const traverse = (node: UniversalNode) => {
      // Extract imports
      if (node.kind === "import_statement") {
        this.extractImport(node, symbols);
      }

      // Extract functions
      if (node.kind === "function_declaration" || node.kind === "arrow_function") {
        const name = this.extractFunctionName(node);
        if (name) {
          symbols.functions.push({
            name,
            kind: "function",
            nodeId: node.id,
            exported: this.isExported(node),
            async: this.isAsync(node),
          });
        }
      }

      // Extract classes
      if (node.kind === "class_declaration") {
        const name = this.extractClassName(node);
        if (name) {
          symbols.classes.push({
            name,
            kind: "class",
            nodeId: node.id,
            exported: this.isExported(node),
          });
        }
      }

      // Extract React components (JSX)
      if (node.kind === "jsx_element" && language === "tsx") {
        const name = this.extractComponentName(node);
        if (name) {
          symbols.components.push({
            name,
            kind: "component",
            nodeId: node.id,
            exported: this.isExported(node),
          });
        }
      }

      // Recurse
      for (const child of node.children) {
        traverse(child);
      }
    };

    traverse(ast);
  }

  private extractImport(node: UniversalNode, symbols: SymbolTable): void {
    // Parse import statement from text
    const text = node.text;
    const match = text.match(/import\s+(?:[^'"]+\s+from\s+)?['"]([^'"]+)['"]/);
    if (match) {
      symbols.imports.push({
        specifier: match[1],
        names: [],
        isDefault: text.includes("import default"),
        isNamespace: text.includes("import * as"),
        nodeId: node.id,
      });
    }
  }

  private extractFunctionName(node: UniversalNode): string | null {
    const match = node.text.match(/(?:function\s+|const\s+(\w+)\s*=\s*(?:async\s*)?\()/);
    if (match) return match[1] ?? match[2] ?? null;
    return null;
  }

  private extractClassName(node: UniversalNode): string | null {
    const match = node.text.match(/class\s+(\w+)/);
    return match?.[1] ?? null;
  }

  private extractComponentName(node: UniversalNode): string | null {
    // Look for PascalCase element names
    const match = node.text.match(/<([A-Z]\w+)/);
    return match?.[1] ?? null;
  }

  private isExported(node: UniversalNode): boolean {
    // Check if parent or text contains export
    return node.text.startsWith("export") || false;
  }

  private isAsync(node: UniversalNode): boolean {
    return node.text.includes("async ");
  }
}
