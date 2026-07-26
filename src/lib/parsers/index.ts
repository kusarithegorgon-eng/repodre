/**
 * Universal Parsing Layer
 *
 * Exports the parser factory, types, and language-specific parsers
 * for creating language-agnostic ASTs from source code.
 */

export * from "./types";
export { parserFactory, parseSource, parseSources } from "./parser-factory";
export { TypeScriptParser } from "./typescript-parser";
export { PythonParser } from "./python-parser";
export { PhpParser } from "./php-parser";
export { JavaParser } from "./java-parser";
export { GoParser } from "./go-parser";
export { normalizeModule, normalizeModules } from "./unified-schema";
export type { UnifiedNode, UnifiedEdge, UnifiedSchema, NodeType, EdgeType, NodeMetadata } from "./unified-schema";
