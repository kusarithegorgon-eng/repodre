/**
 * Parser Factory - Creates and manages language-specific parsers.
 *
 * Provides a unified entry point for parsing source files across
 * multiple languages using the Parser interface contract.
 */

import type { Parser, ParserFactory, SourceLanguage, ParsedModule } from "./types";
import { TypeScriptParser } from "./typescript-parser";
import { PythonParser } from "./python-parser";

class ParserFactoryImpl implements ParserFactory {
  private parsers = new Map<SourceLanguage, Parser>();

  constructor() {
    // Register default parsers
    this.register(new TypeScriptParser());
    this.register(new PythonParser());
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
      case "go":
        return "go";
      case "rs":
        return "rust";
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
