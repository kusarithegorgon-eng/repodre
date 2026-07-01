import { describe, expect, it } from "vitest";
import { exportSchema, type ErdTable, type ExportTarget } from "./sql-export";

const TABLES: ErdTable[] = [
  {
    name: "users",
    columns: [
      { name: "id", type: "INTEGER", pk: true, fk: false, unique: false, nullable: false },
      { name: "email", type: "TEXT", pk: false, fk: false, unique: true, nullable: false },
    ],
  },
  {
    name: "posts",
    columns: [
      { name: "id", type: "INTEGER", pk: true, fk: false, unique: false, nullable: false },
      { name: "user_id", type: "INTEGER", pk: false, fk: true, unique: false, nullable: true, referencesTable: "users", referencesColumn: "id" },
      { name: "title", type: "TEXT", pk: false, fk: false, unique: false, nullable: false },
    ],
  },
];

// ─── PostgreSQL / Supabase export ───────────────────────────────────────────

describe("exportSchema — PostgreSQL / Supabase", () => {
  const sql = exportSchema(TABLES, { target: "postgresql" });

  it("emits CREATE TABLE with quoted identifiers", () => {
    expect(sql).toContain('CREATE TABLE "users"');
    expect(sql).toContain('CREATE TABLE "posts"');
  });

  it("uses PostgreSQL types (SERIAL-equivalent INTEGER, TEXT, TIMESTAMPTZ)", () => {
    expect(sql).toContain('"id" INTEGER PRIMARY KEY');
    expect(sql).toContain('"email" TEXT');
  });

  it("emits inline FOREIGN KEY constraints", () => {
    expect(sql).toContain("FOREIGN KEY");
    expect(sql).toContain('REFERENCES "users"');
  });

  it("includes DROP TABLE IF EXISTS for idempotent re-runs", () => {
    expect(sql).toContain("DROP TABLE IF EXISTS");
  });

  it("does NOT include MySQL ENGINE=InnoDB", () => {
    expect(sql).not.toContain("ENGINE=InnoDB");
  });
});

// ─── MySQL / XAMPP export ───────────────────────────────────────────────────

describe("exportSchema — MySQL / XAMPP", () => {
  const sql = exportSchema(TABLES, { target: "mysql" });

  it("wraps identifiers in backticks", () => {
    expect(sql).toContain("CREATE TABLE `users`");
    expect(sql).toContain("`id`");
    expect(sql).toContain("`email`");
  });

  it("appends ENGINE=InnoDB to each CREATE TABLE", () => {
    expect(sql).toContain("ENGINE=InnoDB");
  });

  it("uses AUTO_INCREMENT for primary keys", () => {
    expect(sql).toContain("AUTO_INCREMENT PRIMARY KEY");
  });

  it("emits FK as CONSTRAINT blocks", () => {
    expect(sql).toContain("CONSTRAINT");
    expect(sql).toContain("FOREIGN KEY");
    expect(sql).toContain("REFERENCES `users`");
  });

  it("disables foreign key checks during import", () => {
    expect(sql).toContain("SET FOREIGN_KEY_CHECKS = 0");
    expect(sql).toContain("SET FOREIGN_KEY_CHECKS = 1");
  });
});

// ─── SQLite export ──────────────────────────────────────────────────────────

describe("exportSchema — SQLite", () => {
  const sql = exportSchema(TABLES, { target: "sqlite" });

  it("strips types to SQLite primitives", () => {
    expect(sql).toContain('"id" INTEGER');
    expect(sql).toContain('"email" TEXT');
    expect(sql).not.toContain("VARCHAR");
    expect(sql).not.toContain("SERIAL");
  });

  it("uses inline REFERENCES for FK (not separate CONSTRAINT blocks)", () => {
    expect(sql).toContain("REFERENCES");
    // SQLite nests FK inline, not as a separate CONSTRAINT line
    expect(sql).not.toContain("CONSTRAINT");
  });

  it("emits AUTOINCREMENT for INTEGER primary keys", () => {
    expect(sql).toContain("PRIMARY KEY AUTOINCREMENT");
  });

  it("does NOT include ENGINE=InnoDB", () => {
    expect(sql).not.toContain("ENGINE");
  });
});

// ─── Cross-target consistency ───────────────────────────────────────────────

describe("exportSchema — all targets produce valid SQL", () => {
  const targets: ExportTarget[] = ["postgresql", "mysql", "sqlite"];
  for (const target of targets) {
    it(`${target}: produces non-empty SQL with both tables`, () => {
      const sql = exportSchema(TABLES, { target });
      expect(sql.length).toBeGreaterThan(50);
      expect(sql).toContain("users");
      expect(sql).toContain("posts");
      expect(sql).toContain("CREATE TABLE");
    });
  }
});
