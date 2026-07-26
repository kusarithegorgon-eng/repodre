/**
 * Parser Factory - Creates and manages language-specific parsers.
 *
 * Provides a unified entry point for parsing source files across
 * multiple languages using the Parser interface contract.
 */

import type { Parser, ParserFactory, SourceLanguage, ParsedModule } from "./types";
import { TypeScriptParser } from "./typescript-parser";
import { PythonParser } from "./python-parser";
import { PhpParser } from "./php-parser";
import { JavaParser } from "./java-parser";
import { GoParser } from "./go-parser";
import { CParser } from "./c-parser";
import { CppParser } from "./cpp-parser";
import { CSharpParser } from "./csharp-parser";

class ParserFactoryImpl implements ParserFactory {
  private parsers = new Map<SourceLanguage, Parser>();

  constructor() {
    // Register default parsers
    this.register(new TypeScriptParser());
    this.register(new PythonParser());
    this.register(new PhpParser());
    this.register(new JavaParser());
    this.register(new GoParser());
    this.register(new CParser());
    this.register(new CppParser());
    this.register(new CSharpParser());
  }

  getParser(language: SourceLanguage): Parser {
    const parser = this.parsers.get(language);
    if (!parser) {
      throw new Error(`No parser registered for language: ${language}`);
    }
    return parser;
  }

  getParserForPath(path: string): Parser | null {
    const language = this.detectLanguage(path);
    if (!language) return null;
    return this.parsers.get(language) ?? null;
  }

  register(parser: Parser): void {
    this.parsers.set(parser.language, parser);
  }

  getSupportedLanguages(): SourceLanguage[] {
    return Array.from(this.parsers.keys());
  }

  private detectLanguage(path: string): SourceLanguage | null {
    const ext = path.split(".").pop()?.toLowerCase();
    switch (ext) {
      case "ts":
        return "typescript";
      case "tsx":
        return "tsx";
      case "js":
      case "jsx":
        return "javascript";
      case "py":
        return "python";
      case "php":
        return "php";
      case "java":
        return "java";
      case "go":
        return "go";
      case "rs":
        return "rust";
      case "c":
      case "h":
        return "c";
      case "cpp":
      case "cc":
      case "cxx":
      case "hpp":
      case "hh":
      case "hxx":
        return "cpp";
      case "cs":
        return "csharp";
      default:
        return null;
    }
  }
}

// Singleton factory instance
export const parserFactory: ParserFactory = new ParserFactoryImpl();

/**
 * Parse a source file using the appropriate parser.
 */
export function parseSource(source: string, path: string): ParsedModule {
  const parser = parserFactory.getParserForPath(path);
  if (!parser) {
    // Return a minimal module for unsupported files
    return {
      path,
      language: "typescript",
      ast: {
        id: "root",
        kind: "unhandled",
        text: source,
        start: { row: 0, column: 0 },
        end: { row: 0, column: 0 },
        children: [],
      },
      source,
      errors: [],
      symbols: {
        exports: [],
        imports: [],
        functions: [],
        classes: [],
        variables: [],
        components: [],
        routes: [],
      },
    };
  }
  return parser.parse(source, path);
}

/**
 * Parse multiple source files in parallel.
 */
export async function parseSources(
  files: Map<string, string>
): Promise<ParsedModule[]> {
  const results: ParsedModule[] = [];
  for (const [path, source] of files) {
    results.push(parseSource(source, path));
  }
  return results;
}
