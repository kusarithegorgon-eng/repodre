/**
 * CodePreviewPanel — Component-to-Code Live Preview
 *
 * A slide-out drawer panel from the right margin that displays
 * syntax-highlighted source code or SQL schema for the selected node.
 * Includes "View Raw" toggle to see full GitHub source content.
 */

import { useState, useEffect, useMemo, useRef } from "react";
import { X, FileCode, Database, Code as Code2, FileText, Copy, Check, ExternalLink, Eye, EyeOff, CircleHelp as HelpCircle } from "lucide-react";
import type { BlueprintNode } from "@/lib/blueprint-analyzer";
import type { ParsedModule } from "@/lib/ast-parser";

interface CodePreviewPanelProps {
  isOpen: boolean;
  onClose: () => void;
  selectedNode: BlueprintNode | null;
  modules: ParsedModule[];
  width?: number;
}

interface SyntaxHighlightRule {
  pattern: RegExp;
  className: string;
}

const JS_SYNTAX_RULES: SyntaxHighlightRule[] = [
  // Keywords
  { pattern: /\b(const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|new|class|extends|import|export|from|default|async|await|try|catch|finally|throw|typeof|instanceof|in|of)\b/g, className: "text-purple-400" },
  // Types
  { pattern: /\b(interface|type|enum|namespace|module|declare|abstract|implements|public|private|protected|readonly|static)\b/g, className: "text-purple-300" },
  // Primitives
  { pattern: /\b(string|number|boolean|null|undefined|void|any|never|unknown|bigint|symbol|object)\b/g, className: "text-teal-400" },
  // Built-ins
  { pattern: /\b(console|Math|JSON|Date|Array|Object|String|Number|Boolean|Error|Promise|Map|Set|RegExp|setTimeout|setInterval|fetch|Response|Request|Headers|URL|FormData)\b/g, className: "text-blue-300" },
  // Strings (double quotes)
  { pattern: /"([^"\\]|\\.)*"/g, className: "text-green-400" },
  // Strings (single quotes)
  { pattern: /'([^'\\]|\\.)*'/g, className: "text-green-400" },
  // Template literals
  { pattern: /`([^`\\]|\\.)*`/g, className: "text-green-300" },
  // Comments (single-line)
  { pattern: /\/\/.*$/gm, className: "text-gray-500 italic" },
  // Comments (multi-line)
  { pattern: /\/\*[\s\S]*?\*\//g, className: "text-gray-500 italic" },
  // JSX tags
  { pattern: /<\/?[\w.]+/g, className: "text-blue-400" },
  // JSX closing
  { pattern: /\/?>/g, className: "text-blue-400" },
  // Numbers
  { pattern: /\b\d+\.?\d*\b/g, className: "text-amber-400" },
  // Booleans
  { pattern: /\b(true|false)\b/g, className: "text-amber-300" },
  // Arrow function
  { pattern: /=>/g, className: "text-purple-400" },
  // Function calls
  { pattern: /\b([\w]+)\s*\(/g, className: "text-yellow-300" },
];

const SQL_SYNTAX_RULES: SyntaxHighlightRule[] = [
  // Keywords
  { pattern: /\b(CREATE|TABLE|ALTER|DROP|SELECT|INSERT|UPDATE|DELETE|FROM|WHERE|JOIN|INNER|LEFT|RIGHT|OUTER|ON|AND|OR|NOT|NULL|PRIMARY|KEY|FOREIGN|REFERENCES|UNIQUE|DEFAULT|CHECK|CONSTRAINT|INDEX|VIEW|DATABASE|SCHEMA|GRANT|REVOKE|COMMIT|ROLLBACK|BEGIN|END|IF|ELSE|THEN|CASE|WHEN|AS|ORDER|BY|ASC|DESC|LIMIT|OFFSET|GROUP|HAVING|UNION|ALL|DISTINCT|INTO|VALUES|SET|RETURNS|FUNCTION|PROCEDURE|TRIGGER|DECLARE|RETURNS|LANGUAGE|SECURITY|DEFINER|INVOKER|RETURNS|RETURN|EXECUTE|EXEC)\b/gi, className: "text-purple-400" },
  // Data types
  { pattern: /\b(INTEGER|INT|SMALLINT|BIGINT|SERIAL|BIGSERIAL|SMALLSERIAL|DECIMAL|NUMERIC|REAL|DOUBLE|PRECISION|FLOAT|VARCHAR|CHARACTER|VARYING|CHAR|TEXT|BOOLEAN|BOOL|DATE|TIME|TIMESTAMP|TIMESTAMPTZ|INTERVAL|UUID|JSON|JSONB|ARRAY|BYTEA|BLOB|CLOB)\b/gi, className: "text-teal-400" },
  // Strings
  { pattern: /'([^'\\]|\\.)*'/g, className: "text-green-400" },
  // Comments
  { pattern: /--.*$/gm, className: "text-gray-500 italic" },
  { pattern: /\/\*[\s\S]*?\*\//g, className: "text-gray-500 italic" },
  // Numbers
  { pattern: /\b\d+\.?\d*\b/g, className: "text-amber-400" },
  // Brackets
  { pattern: /[\[\]()]/g, className: "text-yellow-300" },
  // Operators
  { pattern: /[<>=!]+/g, className: "text-red-400" },
];

function applySyntaxHighlight(code: string, rules: SyntaxHighlightRule[]): string {
  let result = code;

  // Escape HTML first
  result = result
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Apply each rule (we need to protect already highlighted spans)
  for (const rule of rules) {
    result = result.replace(rule.pattern, (match) => {
      // Don't re-highlight inside existing spans
      return `<span class="${rule.className}">${match}</span>`;
    });
  }

  return result;
}

function detectLanguage(source: string): "typescript" | "javascript" | "sql" | "json" | "unknown" {
  const lower = source.toLowerCase();

  // SQL detection
  if (/^\s*(create\s+table|select\s+|insert\s+|update\s+|delete\s+|alter\s+|drop\s+)/i.test(source.trim()) ||
      lower.includes("primary key") ||
      lower.includes("foreign key") ||
      lower.includes("references")) {
    return "sql";
  }

  // TypeScript detection
  if (source.includes(": ") && /\b(string|number|boolean|any|void|null|undefined|interface|type\s+\w|Promise<)/.test(source)) {
    return "typescript";
  }

  // JSON detection
  if (/^\s*[\[{]/.test(source.trim()) && /[\]}]\s*$/.test(source.trim())) {
    try {
      JSON.parse(source);
      return "json";
    } catch {
      // Not valid JSON
    }
  }

  // JavaScript detection
  if (/import\s+|export\s+|function\s+\w|const\s+\w|let\s+\w|var\s+\w/.test(source)) {
    return "javascript";
  }

  return "unknown";
}

function highlightCode(code: string, language: string): string {
  switch (language) {
    case "typescript":
    case "javascript":
      return applySyntaxHighlight(code, JS_SYNTAX_RULES);
    case "sql":
      return applySyntaxHighlight(code, SQL_SYNTAX_RULES);
    case "json":
      try {
        return `<pre class="text-green-300">${JSON.stringify(JSON.parse(code), null, 2)}</pre>`;
      } catch {
        return code;
      }
    default:
      return code;
  }
}

function extractRelevantCode(source: string, node: BlueprintNode): string {
  // Try to find the specific function/route definition for the node
  const label = node.label.toLowerCase().replace(/[^a-z0-9]/g, "");

  if (node.type === "controller") {
    // Find exported HTTP method functions
    const methodMatch = source.match(
      new RegExp(`export\\s+(?:async\\s+)?function\\s+(GET|POST|PUT|DELETE|PATCH)\\s*\\([\\s\\S]*?^\\}`, "m")
    );
    if (methodMatch) return methodMatch[0];

    // Find handler function in Pages Router
    const handlerMatch = source.match(
      /export\s+default\s+async\s+function\s+handler\s*\([\s\S]*?^\}/m
    );
    if (handlerMatch) return handlerMatch[0];
  }

  if (node.type === "view") {
    // Return the whole component/module for view nodes
    // Truncate if too long
    if (source.length > 2000) {
      return source.slice(0, 2000) + "\n\n// ... (truncated)";
    }
    return source;
  }

  if (node.type === "validation") {
    // Find z.object or yup.object
    const zodMatch = source.match(
      /const\s+\w+\s*=\s*z\.object\s*\([\s\S]*?\)/
    );
    if (zodMatch) return zodMatch[0];

    const yupMatch = source.match(
      /const\s+\w+\s*=\s*yup\.object\s*\([\s\S]*?\)/
    );
    if (yupMatch) return yupMatch[0];
  }

  if (node.type === "database") {
    // The label is the table name - find CREATE TABLE or FROM references
    const tableName = node.label;
    const createMatch = source.match(
      new RegExp(`CREATE\\s+TABLE[^;]*\\b${tableName}\\b[^;]*;`, "i")
    );
    if (createMatch) return createMatch[0];

    // Find references in queries
    const fromMatch = source.match(
      new RegExp(`(?:SELECT|INSERT|UPDATE|DELETE)[\\s\\S]*?FROM[^;]*\\b${tableName}\\b[^;]*;`, "i")
    );
    if (fromMatch) return fromMatch[0];
  }

  // Default: return truncated source
  if (source.length > 2000) {
    return source.slice(0, 2000) + "\n\n// ... (truncated)";
  }
  return source;
}

export function CodePreviewPanel({
  isOpen,
  onClose,
  selectedNode,
  modules,
  width = 480,
}: CodePreviewPanelProps) {
  const [copied, setCopied] = useState(false);
  const [viewRaw, setViewRaw] = useState(false);
  const codeRef = useRef<HTMLPreElement>(null);

  // Find the matching module for the selected node
  const module = useMemo(() => {
    if (!selectedNode) return null;

    // Try to find by source path
    if (selectedNode.sourcePath) {
      const found = modules.find((m) => m.path === selectedNode.sourcePath);
      if (found) return found;
    }

    // Try to find by label matching path
    const normalizedLabel = selectedNode.label.toLowerCase().replace(/[^a-z0-9]/g, "");
    return modules.find((m) => {
      const normalizedPath = m.path.toLowerCase().replace(/[^a-z0-9]/g, "");
      return normalizedPath.includes(normalizedLabel);
    });
  }, [selectedNode, modules]);

  // Extract relevant code for the node
  const { code, language, highlightedCode } = useMemo(() => {
    if (!module || !selectedNode) {
      return { code: "", language: "unknown", highlightedCode: "" };
    }

    // If "View Raw" is enabled, show the full source
    if (viewRaw) {
      const rawCode = module.source;
      const lang = detectLanguage(rawCode);
      const highlighted = highlightCode(rawCode, lang);
      return { code: rawCode, language: lang, highlightedCode: highlighted };
    }

    const relevantCode = extractRelevantCode(module.source, selectedNode);
    const lang = detectLanguage(relevantCode);
    const highlighted = highlightCode(relevantCode, lang);

    return { code: relevantCode, language: lang, highlightedCode: highlighted };
  }, [module, selectedNode, viewRaw]);

  // Generate decision explanation for why this node was classified
  const decisionExplanation = useMemo(() => {
    if (!selectedNode || !module) return null;

    const explanations: string[] = [];
    const path = module.path.toLowerCase();
    const src = module.source;

    switch (selectedNode.type) {
      case "view":
        if (path.includes("/app/") && path.endsWith("page.tsx")) {
          explanations.push("Detected Next.js App Router page (app/**/page.tsx)");
        } else if (path.includes("/pages/") && /\.(tsx|jsx)$/.test(path)) {
          explanations.push("Detected Next.js Pages Router file (pages/*.tsx)");
        } else if (/path\s*:\s*["']\//.test(src)) {
          explanations.push("Found route path definition in source");
        }
        explanations.push("Represents a user-facing route/screen");
        break;

      case "controller":
        if (path.includes("/api/") && path.includes("route.ts")) {
          explanations.push("Detected Next.js App Router API handler (app/api/**/route.ts)");
        } else if (path.includes("/pages/api/")) {
          explanations.push("Detected Pages Router API endpoint (pages/api/*)");
        }
        if (/export\s+(async\s+)?function\s+(GET|POST|PUT|DELETE|PATCH)/.test(src)) {
          explanations.push("Contains exported HTTP method handler");
        }
        break;

      case "validation":
        if (/z\.\s*object\s*\(/.test(src)) {
          explanations.push("Contains Zod schema definition (z.object())");
        } else if (/yup\.\s*object\s*\(/.test(src)) {
          explanations.push("Contains Yup schema definition (yup.object())");
        } else if (/if\s*\(\s*!/.test(src)) {
          explanations.push("Contains custom validation guards (if (!x))");
        }
        break;

      case "database":
        if (/\.from\s*\(\s*['"`]/.test(src)) {
          explanations.push("Contains Supabase query (.from())");
        } else if (/prisma\.\w+\.\w+/.test(src)) {
          explanations.push("Contains Prisma client query (prisma.model.method())");
        } else if (/CREATE\s+TABLE/i.test(src)) {
          explanations.push("Contains SQL CREATE TABLE statement");
        }
        break;

      case "misc":
        explanations.push("File did not match classification patterns for routes, controllers, validation, or database");
        explanations.push("Labeled as MISC to ensure nothing is lost during analysis");
        break;

      default:
        explanations.push("Classification method: " + selectedNode.type);
    }

    return explanations;
  }, [selectedNode, module]);

  // Handle copy
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Reset viewRaw when node changes
  useEffect(() => {
    setViewRaw(false);
  }, [selectedNode?.id]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-y-0 right-0 z-40 flex flex-col bg-popover border-l border-border shadow-2xl transition-transform duration-300"
      style={{ width }}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          {selectedNode?.type === "database" ? (
            <Database className="h-4 w-4 text-blue-400" />
          ) : selectedNode?.type === "controller" ? (
            <Code2 className="h-4 w-4 text-teal" />
          ) : selectedNode?.type === "validation" ? (
            <FileText className="h-4 w-4 text-purple-400" />
          ) : selectedNode?.type === "misc" ? (
            <FileCode className="h-4 w-4 text-stone-400" />
          ) : (
            <FileCode className="h-4 w-4 text-green-400" />
          )}
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              {selectedNode?.label || "Select a node"}
            </h3>
            <p className="text-xs text-muted-foreground">
              {module?.path || "No source file found"}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          data-tip="Close code preview"
          className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent transition-colors"
        >
          <X className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>

      {/* Toolbar */}
      {module && (
        <div className="flex items-center gap-2 border-b border-border px-4 py-2">
          <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${
            language === "typescript"
              ? "bg-blue-500/10 text-blue-400"
              : language === "javascript"
              ? "bg-yellow-500/10 text-yellow-400"
              : language === "sql"
              ? "bg-purple-500/10 text-purple-400"
              : "bg-surface text-muted-foreground"
          }`}>
            {language.toUpperCase()}
          </span>
          <span className="text-xs text-muted-foreground">
            {selectedNode?.sub}
          </span>
          <div className="flex-1" />
          {/* View Raw toggle */}
          <button
            onClick={() => setViewRaw(!viewRaw)}
            data-tip={viewRaw ? "Show extracted code" : "Show full file content"}
            className={`flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors ${
              viewRaw
                ? "bg-teal/10 text-teal"
                : "text-muted-foreground hover:text-foreground hover:bg-accent"
            }`}
          >
            {viewRaw ? (
              <>
                <EyeOff className="h-3 w-3" />
                Raw
              </>
            ) : (
              <>
                <Eye className="h-3 w-3" />
                View Raw
              </>
            )}
          </button>
          <button
            onClick={handleCopy}
            data-tip="Copy code to clipboard"
            className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            {copied ? (
              <>
                <Check className="h-3 w-3 text-green-400" />
                Copied
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" />
                Copy
              </>
            )}
          </button>
        </div>
      )}

      {/* Decision Explanation */}
      {decisionExplanation && decisionExplanation.length > 0 && (
        <div className="border-b border-border px-4 py-2 bg-accent/30">
          <div className="flex items-start gap-2">
            <HelpCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-medium text-foreground mb-1">
                Why this classification?
              </p>
              <ul className="space-y-0.5">
                {decisionExplanation.map((reason, i) => (
                  <li key={i} className="text-xs text-muted-foreground flex items-start gap-1">
                    <span className="text-teal shrink-0">•</span>
                    {reason}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Code viewer */}
      <div className="flex-1 overflow-auto bg-[#1e1e2e] p-4">
        {module ? (
          <pre
            ref={codeRef}
            className="text-sm font-mono leading-relaxed whitespace-pre-wrap break-words"
            dangerouslySetInnerHTML={{ __html: highlightedCode }}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <FileCode className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <p className="text-sm text-muted-foreground">
              Click a node on the canvas to view its source code
            </p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              The relevant code for that node will appear here
            </p>
          </div>
        )}
      </div>

      {/* Footer */}
      {module && (
        <div className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
          {selectedNode?.line && (
            <span>Line {selectedNode.line} • </span>
          )}
          <span>{code.split("\n").length} lines</span>
        </div>
      )}
    </div>
  );
}

export function CodePreviewToggle({
  onClick,
  isOpen,
  hasSelection,
}: {
  onClick: () => void;
  isOpen: boolean;
  hasSelection: boolean;
}) {
  return (
    <button
      onClick={onClick}
      data-tip="View source code for selected node"
      className={`flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-medium transition-all ${
        isOpen
          ? "border-teal bg-teal/10 text-teal"
          : hasSelection
          ? "border-border bg-background text-foreground hover:border-teal hover:text-teal"
          : "border-border bg-background text-muted-foreground hover:border-teal hover:text-teal"
      }`}
    >
      <FileCode className="h-3.5 w-3.5" />
      View Code
    </button>
  );
}
