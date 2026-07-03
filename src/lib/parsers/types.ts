/**
 * Universal Parsing Layer - Type Definitions
 *
 * Language-agnostic AST types that form the contract between
 * tree-sitter parsers and the analysis engine.
 */

/**
 * Supported source languages for parsing.
 */
export type SourceLanguage = "typescript" | "tsx" | "javascript" | "python" | "go" | "rust";

/**
 * Universal AST Node - normalized representation across languages.
 */
export interface UniversalNode {
  /** Unique identifier within the AST */
  id: string;
  /** Node type (function, class, method, import, etc.) */
  kind: NodeKind;
  /** Original source text */
  text: string;
  /** Start position in source */
  start: Position;
  /** End position in source */
  end: Position;
  /** Child nodes */
  children: UniversalNode[];
  /** Parent node ID (for tree traversal) */
  parentId?: string;
  /** Language-specific metadata */
  meta?: Record<string, unknown>;
}

export interface Position {
  row: number;
  column: number;
  byte?: number;
}

export type NodeKind =
  | "function_declaration"
  | "function_expression"
  | "arrow_function"
  | "class_declaration"
  | "method_definition"
  | "import_statement"
  | "export_statement"
  | "variable_declaration"
  | "call_expression"
  | "member_expression"
  | "identifier"
  | "string"
  | "number"
  | "jsx_element"
  | "jsx_self_closing_element"
  | "decorator"
  | "function_definition"
  | "class_definition"
  | "import_from_statement"
  | "assignment"
  | "expression_statement"
  | "block"
  | "if_statement"
  | "for_statement"
  | "while_statement"
  | "try_statement"
  | "with_statement"
  | "return_statement"
  | "throw_statement"
  | "await_expression"
  | "unhandled";

/**
 * Parsed module result from the universal parser.
 */
export interface ParsedModule {
  /** Source file path */
  path: string;
  /** Detected language */
  language: SourceLanguage;
  /** Root AST node */
  ast: UniversalNode;
  /** Raw source content */
  source: string;
  /** Parse errors if any */
  errors: ParseError[];
  /** Extracted symbols for quick lookup */
  symbols: SymbolTable;
}

export interface ParseError {
  message: string;
  start: Position;
  end: Position;
}

export interface SymbolTable {
  /** Exported functions/classes */
  exports: Symbol[];
  /** Imported modules */
  imports: Import[];
  /** Defined functions */
  functions: Symbol[];
  /** Defined classes */
  classes: Symbol[];
  /** Defined variables/constants */
  variables: Symbol[];
  /** React components (TSX/JSX) */
  components: Symbol[];
}

export interface Symbol {
  name: string;
  kind: "function" | "class" | "variable" | "component" | "constant";
  nodeId: string;
  exported: boolean;
  async?: boolean;
  params?: string[];
  returnType?: string;
}

export interface Import {
  specifier: string;
  names: string[];
  isDefault: boolean;
  isNamespace: boolean;
  nodeId: string;
}

/**
 * Parser interface - contract for all language parsers.
 */
export interface Parser {
  /** Language this parser handles */
  language: SourceLanguage;

  /** Parse source code into a universal AST */
  parse(source: string, path: string): ParsedModule;

  /** Check if this parser can handle the given file */
  canParse(path: string): boolean;

  /** Get language from file extension */
  getLanguage(path: string): SourceLanguage | null;
}

/**
 * Parser factory for creating language-specific parsers.
 */
export interface ParserFactory {
  /** Get parser for a language */
  getParser(language: SourceLanguage): Parser;

  /** Get parser for a file path */
  getParserForPath(path: string): Parser | null;

  /** Register a new parser */
  register(parser: Parser): void;

  /** List all registered languages */
  getSupportedLanguages(): SourceLanguage[];
}

/**
 * Dependency edge in the parsed graph.
 */
export interface DependencyEdge {
  from: string;
  to: string;
  kind: "import" | "call" | "inherit" | "reference";
  position?: Position;
}

/**
 * Parsed dependency graph from a module.
 */
export interface DependencyGraph {
  nodes: Map<string, UniversalNode>;
  edges: DependencyEdge[];
}
