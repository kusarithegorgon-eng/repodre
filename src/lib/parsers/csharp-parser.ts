/**
 * C# Parser - Regex-based AST extraction for C# source files.
 *
 * Extracts:
 *  - using directives (imports)
 *  - namespace declarations
 *  - class/struct/interface/enum/record definitions with inheritance
 *  - method definitions and declarations (including async, virtual, override)
 *  - properties (get/set)
 *  - ASP.NET Core controller detection ([ApiController], [Route], [HttpGet], etc.)
 *  - Attribute decorations ([Authorize], [Required], [FromBody], etc.)
 *  - delegate declarations
 *
 * Maps all extracted components into the UniversalNode schema so the
 * frontend canvas renders them identically alongside other languages.
 */

import type { Parser, SourceLanguage, ParsedModule, UniversalNode, SymbolTable } from "./types";

const CSHARP_EXTENSIONS = [".cs"];

export class CSharpParser implements Parser {
  readonly language: SourceLanguage = "csharp";

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
      ast = this.parseCSharp(source);
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

    return { path, language: "csharp", ast, source, errors, symbols };
  }

  canParse(path: string): boolean {
    const ext = "." + path.split(".").pop()?.toLowerCase();
    return CSHARP_EXTENSIONS.includes(ext);
  }

  getLanguage(path: string): SourceLanguage | null {
    const ext = path.split(".").pop()?.toLowerCase();
    return ext === "cs" ? "csharp" : null;
  }

  private parseCSharp(source: string): UniversalNode {
    const lines = source.split("\n");
    const children: UniversalNode[] = [];
    const scopeStack: Array<{ name: string; indent: number; node: UniversalNode }> = [];

    let currentNamespace: string | null = null;
    const pendingAttributes: Array<{ name: string; args: string }> = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      const indent = this.getIndent(line);

      if (!trimmed || trimmed.startsWith("//")) continue;
      if (trimmed.startsWith("*") || trimmed.startsWith("/*")) continue;

      // ── using directives ─────────────────────────────────────────────
      const usingMatch = trimmed.match(/^using\s+([\w.:]+)\s*;?/);
      if (usingMatch) {
        children.push({
          id: `using_${i}`,
          kind: "import_from_statement",
          text: trimmed,
          start: { row: i, column: 0 },
          end: { row: i, column: trimmed.length },
          children: [],
          meta: { specifier: usingMatch[1] },
        });
        continue;
      }

      // ── namespace declaration ────────────────────────────────────────
      const nsMatch = trimmed.match(/^namespace\s+([\w.]+)\s*\{?/);
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

      // ── Attributes [Foo], [Foo(args)] ─────────────────────────────────
      const attrMatch = trimmed.match(/^\[([\w.]+)(?:\(([^)]*)\))?\]/);
      if (attrMatch) {
        pendingAttributes.push({
          name: attrMatch[1],
          args: attrMatch[2] ?? "",
        });
        children.push({
          id: `attr_${attrMatch[1]}_${i}`,
          kind: "decorator",
          text: trimmed,
          start: { row: i, column: 0 },
          end: { row: i, column: trimmed.length },
          children: [],
          meta: { annotation: attrMatch[1], args: attrMatch[2] ?? "" },
        });
        continue;
      }

      // ── class/struct/interface/enum/record with inheritance ──────────
      // Matches: public class Foo : Bar, IBaz {  or  internal record Person(string Name);
      const classMatch = trimmed.match(
        /^(?:public\s+|private\s+|protected\s+|internal\s+|static\s+|sealed\s+|abstract\s+|partial\s+|readonly\s+)*(class|struct|interface|enum|record)\s+(\w+)(?:<[^>]*>)?\s*(?::\s*([\w.,<>\s]+))?\s*(?:\{|;|$)/
      );
      if (classMatch) {
        const kind = classMatch[1];
        const name = classMatch[2];
        const inheritance = classMatch[3]?.trim();

        const parents: string[] = [];
        if (inheritance) {
          for (const part of inheritance.split(",")) {
            const trimmedPart = part.trim();
            if (trimmedPart) parents.push(trimmedPart);
          }
        }

        const isController = pendingAttributes.some((a) => a.name === "ApiController" || a.name === "Controller");
        const isEntity = pendingAttributes.some((a) => a.name === "Entity" || a.name === "Table");
        const isService = pendingAttributes.some((a) => a.name === "Service");

        const nodeKind = kind === "interface" ? "class_declaration" : "class_definition";
        const node = this.createClassNode(name, kind, i, indent, parents, currentNamespace);
        node.meta = {
          ...node.meta,
          isController,
          isEntity,
          isService,
          attributes: pendingAttributes.splice(0),
        };
        children.push(node);
        scopeStack.push({ name, indent, node });
        continue;
      }

      // ── delegate declaration ─────────────────────────────────────────
      const delegateMatch = trimmed.match(
        /^(?:public\s+|private\s+|internal\s+)*delegate\s+([\w<>?\[\],\s]+?)\s+(\w+)\s*\(([^)]*)\)\s*;?/
      );
      if (delegateMatch) {
        children.push({
          id: `delegate_${delegateMatch[2]}_${i}`,
          kind: "function_declaration",
          text: `delegate ${delegateMatch[2]}(${delegateMatch[3]})`,
          start: { row: i, column: 0 },
          end: { row: i, column: trimmed.length },
          children: [],
          meta: { name: delegateMatch[2], returnType: delegateMatch[1].trim(), params: delegateMatch[3].split(",").map((p) => p.trim()).filter(Boolean), isDelegate: true, namespace: currentNamespace },
        });
        continue;
      }

      // ── Method definitions ───────────────────────────────────────────
      // Matches: public async Task<List<T>> Foo(params) {  or  void Bar(params) {
      // Handles: virtual, override, async, static, abstract, partial
      const methodMatch = trimmed.match(
        /^(?:public\s+|private\s+|protected\s+|internal\s+|static\s+|virtual\s+|override\s+|async\s+|abstract\s+|sealed\s+|partial\s+|readonly\s+)*([\w<>?\[\],\s]+?)\s+(\w+)\s*\(([^)]*)\)\s*(?:\{|;|$)/
      );
      if (methodMatch) {
        const returnType = methodMatch[1].trim();
        const name = methodMatch[2];
        const params = methodMatch[3];

        // Skip control-flow keywords and false positives
        if (["if", "for", "while", "switch", "return", "throw", "catch", "using", "lock"].includes(name)) continue;
        if (!returnType || returnType.length === 0) continue;
        // Skip property assignments like "int x = 5;"
        if (params === "" && trimmed.includes("=") && !trimmed.includes("(")) continue;

        const paramList = params.split(",").map((p) => p.trim()).filter(Boolean);
        const isAsync = trimmed.includes("async");
        const isDefinition = trimmed.includes("{") || this.isFunctionDefinitionStart(lines, i);

        // Check for route attributes
        const routeAttr = pendingAttributes.find((a) => a.name.endsWith("HttpGet") || a.name.endsWith("HttpPost") || a.name.endsWith("HttpPut") || a.name.endsWith("HttpDelete") || a.name.endsWith("HttpPatch") || a.name.endsWith("Route"));
        const route = routeAttr?.args.match(/["']([^"']+)["']/)?.[1];
        const verb = routeAttr ? this.mapHttpVerb(routeAttr.name) : undefined;

        const node: UniversalNode = {
          id: `method_${name}_${i}`,
          kind: isDefinition ? "method_definition" : "function_declaration",
          text: `${returnType} ${name}(${params})`,
          start: { row: i, column: 0 },
          end: { row: i, column: trimmed.length },
          children: [],
          meta: {
            name,
            params: paramList,
            returnType,
            isAsync,
            namespace: currentNamespace,
            route,
            verb,
            attributes: pendingAttributes.splice(0),
          },
        };

        if (scopeStack.length > 0) {
          const top = scopeStack[scopeStack.length - 1];
          node.parentId = top.node.id;
          top.node.children.push(node);
        } else {
          children.push(node);
        }
        continue;
      }

      // ── Properties (get/set) ──────────────────────────────────────────
      const propMatch = trimmed.match(
        /^(?:public\s+|private\s+|protected\s+|internal\s+|static\s+|virtual\s+|override\s+|abstract\s+)*([\w<>?\[\],\s]+?)\s+(\w+)\s*\{\s*(?:get|set|init)/
      );
      if (propMatch) {
        const type = propMatch[1].trim();
        const name = propMatch[2];
        children.push({
          id: `prop_${name}_${i}`,
          kind: "variable_declaration",
          text: `${type} ${name} { get; set; }`,
          start: { row: i, column: 0 },
          end: { row: i, column: trimmed.length },
          children: [],
          meta: { name, varType: type, isProperty: true, namespace: currentNamespace, attributes: pendingAttributes.splice(0) },
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

      // Clear pending attributes if they weren't consumed
      if (pendingAttributes.length > 0 && !attrMatch) {
        pendingAttributes.length = 0;
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

  private mapHttpVerb(attrName: string): string {
    if (attrName.endsWith("HttpGet")) return "GET";
    if (attrName.endsWith("HttpPost")) return "POST";
    if (attrName.endsWith("HttpPut")) return "PUT";
    if (attrName.endsWith("HttpDelete")) return "DELETE";
    if (attrName.endsWith("HttpPatch")) return "PATCH";
    return "ANY";
  }

  private createClassNode(
    name: string,
    kind: string,
    row: number,
    indent: number,
    parents: string[],
    namespace: string | null,
  ): UniversalNode {
    return {
      id: `class_${name}_${row}`,
      kind: "class_definition",
      text: `${kind} ${name}${parents.length > 0 ? ` : ${parents.join(", ")}` : ""}`,
      start: { row, column: indent },
      end: { row, column: indent + name.length + 6 },
      children: [],
      meta: { name, classKind: kind, parents, namespace },
    };
  }

  private extractSymbols(ast: UniversalNode, symbols: SymbolTable): void {
    const traverse = (node: UniversalNode) => {
      if (node.kind === "class_definition" || node.kind === "class_declaration") {
        const name = node.meta?.name as string | undefined;
        if (name) {
          const kind = node.meta?.isController ? "controller" : node.meta?.isEntity ? "model" : node.meta?.isService ? "service" : "class";
          symbols.classes.push({
            name,
            kind: kind as Symbol["kind"],
            nodeId: node.id,
            exported: true,
          });
        }
      }

      if (node.kind === "method_definition" || node.kind === "function_declaration" || node.kind === "function_definition") {
        const name = node.meta?.name as string | undefined;
        if (name) {
          if (node.meta?.route) {
            const verb = node.meta.verb as string;
            const route = node.meta.route as string;
            symbols.routes.push({
              name: `${verb} ${route}`,
              kind: "route",
              nodeId: node.id,
              exported: true,
              params: node.meta?.params as string[] | undefined,
              returnType: node.meta?.returnType as string | undefined,
            });
          }
          symbols.functions.push({
            name,
            kind: "function",
            nodeId: node.id,
            exported: true,
            async: node.meta?.isAsync as boolean | undefined,
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
