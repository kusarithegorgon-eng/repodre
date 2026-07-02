/**
 * Component-Database Cross Reference Engine
 *
 * Scans backend route files and SQL migration scripts for overlapping
 * table identifiers and entity names. Produces cross-reference links
 * connecting Controller nodes to Database Table cards.
 */

export interface CrossReferenceLink {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  tableName: string;
  matchType: "query" | "schema-definition" | "import";
  confidence: number;
}

export interface TableIdentifier {
  name: string;
  foundIn: "sql" | "typescript";
  context: string;
}

export interface CrossReferenceResult {
  links: CrossReferenceLink[];
  tables: TableIdentifier[];
  controllers: Array<{ nodeId: string; tablesReferenced: string[] }>;
}

/**
 * Extract table names from SQL DDL statements.
 */
export function extractTablesFromSql(source: string): TableIdentifier[] {
  const tables: TableIdentifier[] = [];
  const createMatches = source.matchAll(/\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"]?(\w+)[`"]?/gi);
  for (const m of createMatches) {
    tables.push({ name: m[1], foundIn: "sql", context: "CREATE TABLE" });
  }
  const alterMatches = source.matchAll(/\bALTER\s+TABLE\s+[`"]?(\w+)[`"]?/gi);
  for (const m of alterMatches) {
    tables.push({ name: m[1], foundIn: "sql", context: "ALTER TABLE" });
  }
  return tables;
}

/**
 * Extract table references from TypeScript/JavaScript code.
 * Looks for .from("table"), .into("table"), .table("table"), and raw SQL strings.
 */
export function extractTablesFromTs(source: string): TableIdentifier[] {
  const tables: TableIdentifier[] = [];
  const seen = new Set<string>();

  // Supabase client patterns: .from("users"), .into("users"), .table("users")
  const supabaseMatches = source.matchAll(/\.(?:from|into|table)\s*\(\s*['"`]([a-zA-Z_][a-zA-Z0-9_]*)['"`]/gi);
  for (const m of supabaseMatches) {
    const name = m[1];
    if (!seen.has(name)) {
      seen.add(name);
      tables.push({ name, foundIn: "typescript", context: "supabase query" });
    }
  }

  // Raw SQL in template literals: query`SELECT * FROM users`
  const rawSqlMatches = source.matchAll(/(?:FROM|JOIN|INTO|UPDATE|TABLE)\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi);
  for (const m of rawSqlMatches) {
    const name = m[1];
    if (!seen.has(name) && !name.match(/^(SELECT|WHERE|AND|OR|SET|VALUES)$/i)) {
      seen.add(name);
      tables.push({ name, foundIn: "typescript", context: "raw SQL" });
    }
  }

  return tables;
}

/**
 * Build cross-reference links between controller nodes and database table nodes.
 */
export function buildCrossReferences(
  nodes: Array<{
    id: string;
    label: string;
    sub: string;
    shape: string;
    tableName?: string | null;
  }>,
  modules: Array<{ path: string; source: string }>,
): CrossReferenceResult {
  const links: CrossReferenceLink[] = [];
  const allTables: TableIdentifier[] = [];

  // Collect all table identifiers from modules
  for (const mod of modules) {
    if (mod.path.endsWith(".sql")) {
      allTables.push(...extractTablesFromSql(mod.source));
    } else if (mod.path.endsWith(".ts") || mod.path.endsWith(".tsx") || mod.path.endsWith(".js")) {
      allTables.push(...extractTablesFromTs(mod.source));
    }
  }

  // Find database nodes (cylinders) on the canvas
  const dbNodes = nodes.filter((n) => n.shape === "cylinder" || n.tableName);
  const controllerNodes = nodes.filter(
    (n) => n.shape === "rectangle" || n.sub.toLowerCase().includes("controller"),
  );

  // For each controller, find tables it references and link to matching DB nodes
  const controllerRefs: CrossReferenceResult["controllers"] = [];

  for (const ctrl of controllerNodes) {
    const referencedTables = new Set<string>();

    // Check if any module source references this controller's label
    for (const mod of modules) {
      if (mod.path.endsWith(".ts") || mod.path.endsWith(".tsx")) {
        const tablesInMod = extractTablesFromTs(mod.source);
        // If the module path or content relates to the controller label
        const labelKey = ctrl.label.toLowerCase().replace(/[^a-z0-9]/g, "");
        const modKey = mod.path.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (modKey.includes(labelKey) || labelKey.includes(modKey.split("/").pop() || "")) {
          for (const t of tablesInMod) {
            referencedTables.add(t.name);
          }
        }
      }
    }

    // Create links from controller to matching DB nodes
    for (const tableName of referencedTables) {
      const dbNode = dbNodes.find(
        (n) => n.label.toLowerCase() === tableName.toLowerCase() ||
               n.tableName?.toLowerCase() === tableName.toLowerCase(),
      );
      if (dbNode) {
        links.push({
          id: `xref_${ctrl.id}_${dbNode.id}`,
          fromNodeId: ctrl.id,
          toNodeId: dbNode.id,
          tableName,
          matchType: "query",
          confidence: 0.85,
        });
      }
    }

    if (referencedTables.size > 0) {
      controllerRefs.push({
        nodeId: ctrl.id,
        tablesReferenced: Array.from(referencedTables),
      });
    }
  }

  return {
    links,
    tables: allTables,
    controllers: controllerRefs,
  };
}
