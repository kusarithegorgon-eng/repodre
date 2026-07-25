/**
 * PHP / Laravel Parser - Regex-based AST extraction for PHP files.
 *
 * Provides universal AST output for PHP source files using pattern matching
 * for classes, methods, function calls, Eloquent models, and Laravel route
 * definitions. Mirrors the structure of PythonParser.
 *
 * Laravel specifics recognized:
 *  - Controller classes (subclass of Controller)
 *  - Eloquent models (subclass of Model)
 *  - Route definitions: Route::get/post/put/delete/patch/resource(...)
 *  - Method calls including $this->method(), $model->relation(), and
 *    static calls like View::make(), Model::all(), Model::find()
 */

import type {
  Parser,
  SourceLanguage,
  ParsedModule,
  UniversalNode,
  SymbolTable,
} from "./types";

const PHP_EXTENSIONS = [".php"];

export class PhpParser implements Parser {
  readonly language: SourceLanguage = "php";

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
    };

    try {
      ast = this.parsePhp(source);
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

    return { path, language: "php", ast, source, errors, symbols };
  }

  canParse(path: string): boolean {
    const ext = "." + path.split(".").pop()?.toLowerCase();
    return PHP_EXTENSIONS.includes(ext);
  }

  getLanguage(path: string): SourceLanguage | null {
    const ext = path.split(".").pop()?.toLowerCase();
    return ext === "php" ? "php" : null;
  }

  // ── PHP parsing ──────────────────────────────────────────────────────

  private parsePhp(source: string): UniversalNode {
    const lines = source.split("\n");
    const children: UniversalNode[] = [];
    const scopeStack: Array<{ name: string; indent: number; node: UniversalNode }> = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      const indent = this.getIndent(line);

      if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("#") || trimmed.startsWith("*")) {
        continue;
      }

      // Class definition: class Foo extends Bar implements Baz
      const classMatch = trimmed.match(
        /^(?:abstract\s+|final\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([\w,\s]+))?\s*\{?/
      );
      if (classMatch) {
        const name = classMatch[1];
        const parent = classMatch[2] ?? null;
        const isController = parent === "Controller" || /Controller$/.test(name);
        const isModel = parent === "Model" || /\bModel\b/.test(parent ?? "");
        const kind = isModel ? "php_eloquent_model" : "php_class";
        const node = this.createClassNode(name, i, indent, kind, parent);
        children.push(node);
        scopeStack.push({ name, indent, node });
        continue;
      }

      // Method/function definition: public function foo(...) or function foo(...)
      const methodMatch = trimmed.match(
        /^(?:public\s+|private\s+|protected\s+|static\s+|final\s+|abstract\s+)*function\s+(\w+)\s*\(([^)]*)\)/
      );
      if (methodMatch) {
        const name = methodMatch[1];
        const params = methodMatch[2];
        const isStatic = /\bstatic\b/.test(trimmed);
        const node = this.createMethodNode(name, params, i, indent, isStatic);
        if (scopeStack.length > 0) {
          const top = scopeStack[scopeStack.length - 1];
          if (indent > top.indent) {
            node.parentId = top.node.id;
            top.node.children.push(node);
            // Replace top scope with this method for nested calls
            scopeStack.push({ name: top.name + "." + name, indent, node });
            continue;
          }
        }
        children.push(node);
        scopeStack.push({ name, indent, node });
        continue;
      }

      // Laravel route definition: Route::get('/path', [Controller::class, 'method'])
      const routeMatch = trimmed.match(
        /Route::(\w+)\(\s*['"]([^'"]+)['"]\s*,\s*(?:\[?([\w:]+)::class\s*,\s*['"](\w+)['"]\]?)\)/
      );
      if (routeMatch) {
        const verb = routeMatch[1];
        const uri = routeMatch[2];
        const controller = routeMatch[3];
        const method = routeMatch[4];
        const routeId = `route_${verb}_${uri}`.replace(/[^a-zA-Z0-9_]/g, "_");
        const routeNode = this.createRouteNode(routeId, verb, uri, i);
        children.push(routeNode);
        // Edge: route -> Controller::method
        const targetId = `${controller}.${method}`;
        routeNode.children.push({
          id: `edge_${routeId}_${targetId}`,
          kind: "php_call",
          text: `${verb} ${uri} -> ${targetId}`,
          start: { row: i, column: 0 },
          end: { row: i, column: trimmed.length },
          children: [],
          parentId: routeNode.id,
          meta: { edge: { source: routeId, target: targetId } },
        });
        continue;
      }

      // Function call: $this->foo(), $obj->method(), Foo::bar(), foo()
      const callMatch = trimmed.match(/\$(?:this|self|obj|model)?->(\w+)\s*\(|([\w]+)::(\w+)\s*\(|(?<!\w)([a-z_]\w*)\s*\(/);
      if (callMatch) {
        const caller = this.currentScopeName(scopeStack, indent);
        if (caller) {
          let target: string | null = null;
          if (callMatch[1]) {
            target = callMatch[1];
          } else if (callMatch[2] && callMatch[3]) {
            target = `${callMatch[2]}.${callMatch[3]}`;
          } else if (callMatch[4]) {
            target = callMatch[4];
          }
          if (target) {
            const callNode = this.createCallNode(caller, target, i);
            this.attachToScope(scopeStack, indent, callNode);
          }
        }
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

  private currentScopeName(
    stack: Array<{ name: string; indent: number; node: UniversalNode }>,
    indent: number
  ): string | null {
    for (let i = stack.length - 1; i >= 0; i--) {
      if (stack[i].indent < indent) return stack[i].name;
    }
    return stack.length > 0 ? stack[0].name : null;
  }

  private attachToScope(
    stack: Array<{ name: string; indent: number; node: UniversalNode }>,
    indent: number,
    node: UniversalNode
  ): void {
    for (let i = stack.length - 1; i >= 0; i--) {
      if (stack[i].indent < indent) {
        node.parentId = stack[i].node.id;
        stack[i].node.children.push(node);
        return;
      }
    }
    // No parent — attach to root-level (shouldn't happen for calls)
  }

  private createClassNode(
    name: string,
    row: number,
    indent: number,
    kind: UniversalNode["kind"],
    parent: string | null
  ): UniversalNode {
    return {
      id: `class_${name}_${row}`,
      kind,
      text: `class ${name}${parent ? ` extends ${parent}` : ""}`,
      start: { row, column: indent },
      end: { row, column: indent + name.length + 6 },
      children: [],
      meta: { name, parent },
    };
  }

  private createMethodNode(
    name: string,
    params: string,
    row: number,
    indent: number,
    isStatic: boolean
  ): UniversalNode {
    return {
      id: `method_${name}_${row}`,
      kind: "php_method",
      text: `function ${name}(${params})`,
      start: { row, column: indent },
      end: { row, column: indent + name.length + params.length + 10 },
      children: [],
      meta: { name, static: isStatic, params: params.split(",").map((p) => p.trim()).filter(Boolean) },
    };
  }

  private createRouteNode(
    id: string,
    verb: string,
    uri: string,
    row: number
  ): UniversalNode {
    return {
      id,
      kind: "php_route",
      text: `Route::${verb}('${uri}', ...)`,
      start: { row, column: 0 },
      end: { row, column: 30 },
      children: [],
      meta: { verb, uri },
    };
  }

  private createCallNode(caller: string, target: string, row: number): UniversalNode {
    return {
      id: `call_${caller}_${target}_${row}`,
      kind: "php_call",
      text: `${caller} -> ${target}`,
      start: { row, column: 0 },
      end: { row, column: 0 },
      children: [],
      meta: { edge: { source: caller, target } },
    };
  }

  // ── Symbol extraction ───────────────────────────────────────────────

  private extractSymbols(ast: UniversalNode, symbols: SymbolTable): void {
    const traverse = (node: UniversalNode) => {
      if (node.kind === "php_class" || node.kind === "php_eloquent_model") {
        const name = node.meta?.name as string | undefined;
        if (name) {
          symbols.classes.push({
            name,
            kind: node.kind === "php_eloquent_model" ? "model" : "class",
            nodeId: node.id,
            exported: true,
          });
        }
      }

      if (node.kind === "php_method" || node.kind === "php_function") {
        const name = node.meta?.name as string | undefined;
        if (name) {
          symbols.functions.push({
            name,
            kind: "function",
            nodeId: node.id,
            exported: true,
            async: false,
            params: node.meta?.params as string[] | undefined,
          });
        }
      }

      if (node.kind === "php_route") {
        const verb = node.meta?.verb as string | undefined;
        const uri = node.meta?.uri as string | undefined;
        if (verb && uri) {
          symbols.functions.push({
            name: `Route::${verb}('${uri}')`,
            kind: "route",
            nodeId: node.id,
            exported: true,
            async: false,
          });
        }
      }

      for (const child of node.children) {
        traverse(child);
      }
    };

    traverse(ast);
  }
}
