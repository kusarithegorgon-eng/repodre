/**
 * mermaid-export — Convert Repodre canvas state to Mermaid.js diagram syntax.
 *
 * ERD workspace tables → erdDiagram blocks with columns and relationships.
 * App workspace nodes   → flowchart blocks with labeled edges.
 *
 * The output is valid Mermaid that renders in GitHub, GitLab, Notion,
 * and most markdown renderers.
 */

import type { Node, Edge } from "./db-client";
import type { Cardinality } from "./sql-tokenizer";

const MERMAID_ID_RE = /[^A-Za-z0-9_]/g;

function safeId(raw: string): string {
  return raw.replace(MERMAID_ID_RE, "_");
}

function quoteLabel(label: string): string {
  return `"${label.replace(/"/g, "'")}"`;
}

/**
 * Map Repodre cardinality strings to Mermaid ERD relationship notation.
 * Mermaid uses `||--||` (one-to-one), `||--o{` (one-to-many optional), etc.
 * We keep it simple: one-to-one, one-to-many, many-to-many.
 */
function cardinalityNotation(c: Cardinality): string {
  switch (c) {
    case "one-to-one":
      return "||--||";
    case "one-to-many":
      return "||--o{";
    case "many-to-many":
      return "}o--o{";
    default:
      return "||--o{";
  }
}

/**
 * Convert ERD workspace tables and edges to a Mermaid `erDiagram` block.
 */
export function exportErdToMermaid(nodes: Node[], edges: Edge[]): string {
  const tables = nodes.filter((n) => n.workspace === "erd" && n.columns);
  const lines: string[] = ["erDiagram"];

  // Table definitions with columns
  for (const table of tables) {
    const name = table.tableName ?? table.label;
    const id = safeId(name);
    const cols = table.columns ?? [];
    if (cols.length === 0) {
      lines.push(`  ${id} {`);
      lines.push(`    string id PK`);
      lines.push(`  }`);
    } else {
      lines.push(`  ${id} {`);
      for (const col of cols) {
        const type = col.type.toUpperCase().replace(/\s+/g, "_").replace(/[^A-Z0-9_]/g, "");
        const pkFk = col.pk ? " PK" : col.fk ? " FK" : "";
        const uniq = col.unique && !col.pk ? " UK" : "";
        lines.push(`    ${type || "VARCHAR"} ${safeId(col.name)}${pkFk}${uniq}`);
      }
      lines.push(`  }`);
    }
  }

  // Relationships
  const tableById = new Map(tables.map((t) => [t.id, t]));
  for (const edge of edges) {
    if (!edge.cardinality || !edge.fromColumn || !edge.toColumn) continue;
    const fromTable = tableById.get(edge.from);
    const toTable = tableById.get(edge.to);
    if (!fromTable || !toTable) continue;

    const fromName = safeId(fromTable.tableName ?? fromTable.label);
    const toName = safeId(toTable.tableName ?? toTable.label);
    const notation = cardinalityNotation(edge.cardinality);
    const label = `${edge.fromColumn} -> ${edge.toColumn}`;
    lines.push(`  ${fromName} ${notation} ${toName} : ${quoteLabel(label)}`);
  }

  return lines.join("\n");
}

/**
 * Convert App workspace nodes and edges to a Mermaid `flowchart TD` block.
 */
export function exportAppToMermaid(nodes: Node[], edges: Edge[]): string {
  const appNodes = nodes.filter((n) => n.workspace === "app");
  const lines: string[] = ["flowchart TD"];

  // Node definitions
  for (const node of appNodes) {
    const id = safeId(node.id);
    const label = node.label.replace(/"/g, "'");
    // Use shape-appropriate Mermaid syntax
    switch (node.shape) {
      case "diamond":
        lines.push(`  ${id}{${label}}`);
        break;
      case "cylinder":
        lines.push(`  ${id}[("${label}")]`);
        break;
      case "pill":
        lines.push(`  ${id}([${label}])`);
        break;
      case "circle":
        lines.push(`  ${id}((${label}))`);
        break;
      case "document":
        lines.push(`  ${id}["${label}"]`);
        break;
      case "parallelogram":
        lines.push(`  ${id}[/${label}/]`);
        break;
      case "hexagon":
        lines.push(`  ${id}{{${label}}}`);
        break;
      default:
        lines.push(`  ${id}[${label}]`);
    }
  }

  // Edges
  const nodeById = new Map(appNodes.map((n) => [n.id, n]));
  for (const edge of edges) {
    const from = nodeById.get(edge.from);
    const to = nodeById.get(edge.to);
    if (!from || !to) continue;
    const fromId = safeId(edge.from);
    const toId = safeId(edge.to);
    const label = edge.cardinality
      ? ` -->|${edge.cardinality}| `
      : " --> ";
    lines.push(`  ${fromId}${label}${toId}`);
  }

  return lines.join("\n");
}

/**
 * Convert canvas state to Mermaid syntax, auto-detecting the workspace.
 */
export function exportToMermaid(nodes: Node[], edges: Edge[], workspace: "app" | "erd"): string {
  if (workspace === "erd") {
    return exportErdToMermaid(nodes, edges);
  }
  return exportAppToMermaid(nodes, edges);
}

/**
 * Trigger a download of the Mermaid text as a .mmd file.
 */
export function downloadMermaid(content: string, filename: string): void {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.mmd`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Copy Mermaid text to the clipboard. Returns true on success.
 */
export async function copyMermaidToClipboard(content: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(content);
    return true;
  } catch {
    return false;
  }
}
