/**
 * AstTokenizerInspector — AST Stream View Toggle
 *
 * A toggle on the node detail overlay that displays the lexical token
 * structure of the selected node's source code as a sequential flow block.
 */

import { useState, useMemo } from "react";
import { Braces, X, ChevronRight } from "lucide-react";
import { tokenize, TOKEN_COLORS, TOKEN_LABELS, type Token, type TokenType } from "@/lib/ast-tokenizer";

interface AstTokenizerInspectorProps {
  source: string;
  nodeLabel: string;
}

export function AstTokenizerInspector({ source, nodeLabel }: AstTokenizerInspectorProps) {
  const [isActive, setIsActive] = useState(false);

  const stream = useMemo(() => tokenize(source), [source]);

  if (!isActive) {
    return (
      <button
        onClick={() => setIsActive(true)}
        className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-all hover:border-teal hover:text-teal"
        title="View AST token stream"
      >
        <Braces className="h-3.5 w-3.5" />
        AST Stream View
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-popover shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <Braces className="h-4 w-4 text-teal" />
          <span className="text-xs font-semibold text-foreground">AST Token Stream</span>
          <span className="text-[10px] text-muted-foreground">· {nodeLabel}</span>
        </div>
        <button
          onClick={() => setIsActive(false)}
          className="flex h-6 w-6 items-center justify-center rounded-md hover:bg-accent"
        >
          <X className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </div>

      {/* Token stats bar */}
      <div className="flex flex-wrap gap-1.5 border-b border-border px-3 py-2">
        {Object.entries(stream.stats).map(([key, count]) => {
          if (count === 0) return null;
          const tokenType = key === "scopes" ? "scope-open" : key as TokenType;
          const color = TOKEN_COLORS[tokenType] || "text-muted-foreground";
          return (
            <span
              key={key}
              className={`inline-flex items-center gap-1 rounded bg-surface px-1.5 py-0.5 text-[10px] font-medium ${color}`}
            >
              {key}: {count}
            </span>
          );
        })}
      </div>

      {/* Token stream */}
      <div className="max-h-64 overflow-auto p-3">
        <div className="flex flex-wrap gap-0.5 font-mono text-[11px] leading-relaxed">
          {stream.tokens
            .filter((t) => t.type !== "whitespace")
            .map((token, idx) => (
              <TokenChip key={idx} token={token} />
            ))}
        </div>
      </div>

      {/* Legend */}
      <div className="border-t border-border px-3 py-2">
        <div className="flex flex-wrap gap-2 text-[10px]">
          {Object.entries(TOKEN_LABELS).map(([type, label]) => {
            const tokenType = type as TokenType;
            if (tokenType === "whitespace" || tokenType === "literal") return null;
            return (
              <span key={type} className="flex items-center gap-1">
                <span className={`font-mono ${TOKEN_COLORS[tokenType]}`}>●</span>
                <span className="text-muted-foreground">{label}</span>
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function TokenChip({ token }: { token: Token }) {
  const color = TOKEN_COLORS[token.type] || "text-muted-foreground";
  const label = TOKEN_LABELS[token.type];

  return (
    <span
      className={`group relative inline-flex items-center rounded px-1 py-0.5 ${color} hover:bg-surface`}
      title={`${label} · Line ${token.line}:${token.column}`}
    >
      {token.value}
      <span className="pointer-events-none absolute -top-7 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded bg-foreground px-1.5 py-0.5 text-[9px] text-background opacity-0 transition-opacity group-hover:opacity-100">
        {label}
      </span>
    </span>
  );
}

export function AstTokenizerToggle({
  onClick,
  isActive,
}: {
  onClick: () => void;
  isActive: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-medium transition-all ${
        isActive
          ? "border-teal/50 bg-teal/10 text-teal"
          : "border-border bg-background text-muted-foreground hover:border-teal hover:text-teal"
      }`}
      title="Toggle AST token stream view"
    >
      <Braces className="h-3.5 w-3.5" />
      AST Stream
    </button>
  );
}
