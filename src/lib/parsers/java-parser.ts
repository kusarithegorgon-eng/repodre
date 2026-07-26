/**
 * Java Parser - Regex-based AST extraction for Java source files.
 *
 * Extracts package declarations, class/interface definitions, methods,
 * Spring Boot annotations (@RestController, @RequestMapping, @Service, etc.),
 * and import statements. Maps them into the UniversalNode schema.
 *
 * Spring Boot specifics recognized:
 *  - @RestController / @Controller → controller class
 *  - @Service → service class
 *  - @Repository → repository class
 *  - @Entity → entity/model class
 *  - @RequestMapping / @GetMapping / @PostMapping etc. → route definitions
 */

import type { Parser, SourceLanguage, ParsedModule, UniversalNode, SymbolTable } from "./types";

const JAVA_EXTENSIONS = [".java"];

export class JavaParser implements Parser {
  readonly language: SourceLanguage = "java";

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
      ast = this.parseJava(source);
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

    return { path, language: "java", ast, source, errors, symbols };
  }

  canParse(path: string): boolean {
    const ext = "." + path.split(".").pop()?.toLowerCase();
    return JAVA_EXTENSIONS.includes(ext);
  }

  getLanguage(path: string): SourceLanguage | null {
    const ext = path.split(".").pop()?.toLowerCase();
    return ext === "java" ? "java" : null;
  }

  private parseJava(source: string): UniversalNode {
    const lines = source.split("\n");
    const children: UniversalNode[] = [];
    const scopeStack: Array<{ name: string; indent: number; node: UniversalNode }> = [];

    let packageName: string | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      const indent = this.getIndent(line);

      if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) {
        continue;
      }

      // Package declaration
      const pkgMatch = trimmed.match(/^package\s+([\w.]+)\s*;/);
      if (pkgMatch) {
        packageName = pkgMatch[1];
        children.push({
          id: `package_${i}`,
          kind: "identifier",
          text: `package ${packageName};`,
          start: { row: i, column: 0 },
          end: { row: i, column: trimmed.length },
          children: [],
          meta: { package: packageName },
        });
        continue;
      }

      // Import statement
      const importMatch = trimmed.match(/^import\s+(?:static\s+)?([\w.]+(?:\.\*)?)\s*;/);
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
        continue;
      }

      // Annotation (Spring Boot): @RestController, @Service, @RequestMapping(...)
      const annotationMatch = trimmed.match(/^@(\w+)(?:\(([^)]*)\))?/);
      if (annotationMatch) {
        const annotationName = annotationMatch[1];
        const annotationArgs = annotationMatch[2] ?? "";
        const annotationNode: UniversalNode = {
          id: `annotation_${annotationName}_${i}`,
          kind: "decorator",
          text: trimmed,
          start: { row: i, column: 0 },
          end: { row: i, column: trimmed.length },
          children: [],
          meta: { annotation: annotationName, args: annotationArgs },
        };

        // Spring route mapping annotations
        if (annotationName.endsWith("Mapping")) {
          const routePath = annotationArgs.match(/["']([^"']+)["']/)?.[1] ?? "/";
          annotationNode.meta = {
            ...annotationNode.meta,
            route: routePath,
            verb: this.mapHttpVerb(annotationName),
          };
        }

        // Attach to current scope or root
        if (scopeStack.length > 0) {
          const top = scopeStack[scopeStack.length - 1];
          annotationNode.parentId = top.node.id;
          top.node.children.push(annotationNode);
        } else {
          children.push(annotationNode);
        }
        continue;
      }

      // Class/interface/enum definition
      const classMatch = trimmed.match(
        /^(?:public\s+|private\s+|protected\s+|abstract\s+|final\s+|static\s+)*(?:class|interface|enum)\s+(\w+)(?:\s+extends\s+([\w.,\s<>]+))?(?:\s+implements\s+([\w.,\s<>]+))?\s*\{?/
      );
      if (classMatch) {
        const name = classMatch[1];
        const parent = classMatch[2]?.trim().split(",")[0].trim() ?? null;
        const isController = this.isControllerClass(lines, i);
        const isEntity = this.hasAnnotation(lines, i, "Entity");
        const kind = isEntity ? "class_definition" : "class_declaration";
        const node = this.createClassNode(name, i, indent, kind, parent);
        node.meta = {
          ...node.meta,
          isController,
          isEntity,
          package: packageName,
        };
        children.push(node);
        scopeStack.push({ name, indent, node });
        continue;
      }

      // Method definition: (modifiers) returnType methodName(params) {
      const methodMatch = trimmed.match(
        /^(?:public\s+|private\s+|protected\s+|static\s+|final\s+|abstract\s+|synchronized\s+)*(?:[\w<>\[\],?\s]+)\s+(\w+)\s*\(([^)]*)\)\s*(?:throws\s+[\w.,\s]+)?\s*\{?/
      );
      if (methodMatch) {
        const name = methodMatch[1];
        const params = methodMatch[2];
        // Skip control-flow keywords
        if (["if", "for", "while", "switch", "catch", "return"].includes(name)) continue;
        const node = this.createMethodNode(name, params, i, indent);
        if (scopeStack.length > 0) {
          const top = scopeStack[scopeStack.length - 1];
          if (indent > top.indent || true) {
            node.parentId = top.node.id;
            top.node.children.push(node);
          }
        } else {
          children.push(node);
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

  private isControllerClass(lines: string[], classLine: number): boolean {
    for (let i = Math.max(0, classLine - 5); i < classLine; i++) {
      const t = lines[i].trim();
      if (t.includes("@RestController") || t.includes("@Controller")) return true;
    }
    return false;
  }

  private hasAnnotation(lines: string[], classLine: number, annotation: string): boolean {
    for (let i = Math.max(0, classLine - 5); i < classLine; i++) {
      if (lines[i].trim().includes(`@${annotation}`)) return true;
    }
    return false;
  }

  private mapHttpVerb(annotationName: string): string {
    if (annotationName === "GetMapping") return "GET";
    if (annotationName === "PostMapping") return "POST";
    if (annotationName === "PutMapping") return "PUT";
    if (annotationName === "DeleteMapping") return "DELETE";
    if (annotationName === "PatchMapping") return "PATCH";
    return "ANY";
  }

  private createClassNode(
    name: string,
    row: number,
    indent: number,
    kind: UniversalNode["kind"],
    parent: string | null,
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

  private createMethodNode(name: string, params: string, row: number, indent: number): UniversalNode {
    return {
      id: `method_${name}_${row}`,
      kind: "method_definition",
      text: `${name}(${params})`,
      start: { row, column: indent },
      end: { row, column: indent + name.length + params.length + 2 },
      children: [],
      meta: { name, params: params.split(",").map((p) => p.trim()).filter(Boolean) },
    };
  }

  private extractSymbols(ast: UniversalNode, symbols: SymbolTable): void {
    const traverse = (node: UniversalNode) => {
      if (node.kind === "class_declaration" || node.kind === "class_definition") {
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

      if (node.kind === "method_definition") {
        const name = node.meta?.name as string | undefined;
        if (name) {
          symbols.functions.push({
            name,
            kind: "function",
            nodeId: node.id,
            exported: true,
            params: node.meta?.params as string[] | undefined,
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
            isNamespace: specifier.endsWith(".*"),
            nodeId: node.id,
          });
        }
      }

      if (node.kind === "decorator" && node.meta?.route) {
        const verb = node.meta.verb as string;
        const route = node.meta.route as string;
        symbols.functions.push({
          name: `${verb} ${route}`,
          kind: "route",
          nodeId: node.id,
          exported: true,
        });
      }

      for (const child of node.children) {
        traverse(child);
      }
    };

    traverse(ast);
    symbols.exports = [...symbols.classes, ...symbols.functions];
  }
}
