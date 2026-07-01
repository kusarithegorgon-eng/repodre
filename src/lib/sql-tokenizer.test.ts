import { describe, expect, it } from "vitest";
import {
  parseDdl,
  detectDialect,
  detectCardinality,
  normalizeType,
  type SqlDialect,
} from "./sql-tokenizer";

// ─── Dialect detection ─────────────────────────────────────────────────────

describe("detectDialect", () => {
  it("detects MySQL by ENGINE=InnoDB", () => {
    expect(detectDialect("CREATE TABLE t (id INT) ENGINE=InnoDB;")).toBe("mysql");
  });

  it("detects MySQL by AUTO_INCREMENT", () => {
    expect(
      detectDialect("CREATE TABLE t (id INT AUTO_INCREMENT PRIMARY KEY);")
    ).toBe("mysql");
  });

  it("detects SQLite by AUTOINCREMENT keyword", () => {
    expect(
      detectDialect("CREATE TABLE t (id INTEGER PRIMARY KEY AUTOINCREMENT);")
    ).toBe("sqlite");
  });

  it("detects PostgreSQL by SERIAL", () => {
    expect(
      detectDialect("CREATE TABLE t (id SERIAL PRIMARY KEY);")
    ).toBe("postgresql");
  });

  it("defaults to postgresql for ambiguous input", () => {
    expect(detectDialect("CREATE TABLE t (id INT);")).toBe("postgresql");
  });
});

// ─── Type normalization ────────────────────────────────────────────────────

describe("normalizeType", () => {
  it("maps integer variants to INTEGER", () => {
    expect(normalizeType("INT")).toBe("INTEGER");
    expect(normalizeType("INTEGER")).toBe("INTEGER");
    expect(normalizeType("BIGINT")).toBe("INTEGER");
    expect(normalizeType("TINYINT")).toBe("INTEGER");
    expect(normalizeType("SMALLINT")).toBe("INTEGER");
    expect(normalizeType("SERIAL")).toBe("INTEGER");
  });

  it("maps text variants to TEXT", () => {
    expect(normalizeType("VARCHAR(255)")).toBe("TEXT");
    expect(normalizeType("TEXT")).toBe("TEXT");
    expect(normalizeType("CHAR(10)")).toBe("TEXT");
    expect(normalizeType("LONGTEXT")).toBe("TEXT");
  });

  it("maps decimal/float variants to NUMERIC", () => {
    expect(normalizeType("DECIMAL(10,2)")).toBe("NUMERIC");
    expect(normalizeType("FLOAT")).toBe("NUMERIC");
    expect(normalizeType("DOUBLE")).toBe("NUMERIC");
  });

  it("maps boolean and timestamp", () => {
    expect(normalizeType("BOOLEAN")).toBe("BOOLEAN");
    expect(normalizeType("BOOL")).toBe("BOOLEAN");
    expect(normalizeType("TIMESTAMP")).toBe("TIMESTAMP");
    expect(normalizeType("DATETIME")).toBe("TIMESTAMP");
  });

  it("maps JSON and UUID", () => {
    expect(normalizeType("JSON")).toBe("JSON");
    expect(normalizeType("JSONB")).toBe("JSON");
    expect(normalizeType("UUID")).toBe("UUID");
  });
});

// ─── PostgreSQL parsing ────────────────────────────────────────────────────

describe("parseDdl — PostgreSQL", () => {
  const PG_DDL = `
    CREATE TABLE users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT
    );

    CREATE TABLE posts (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      title TEXT NOT NULL,
      body TEXT
    );
  `;

  it("parses two tables", () => {
    const schema = parseDdl(PG_DDL);
    expect(schema.tables).toHaveLength(2);
    expect(schema.tables.map((t) => t.name).sort()).toEqual(["posts", "users"]);
  });

  it("detects SERIAL as INTEGER with autoincrement", () => {
    const schema = parseDdl(PG_DDL);
    const users = schema.tables.find((t) => t.name === "users")!;
    const id = users.columns.find((c) => c.name === "id")!;
    expect(id.type).toBe("INTEGER");
    expect(id.pk).toBe(true);
    expect(id.autoIncrement).toBe(true);
  });

  it("detects inline FK REFERENCES", () => {
    const schema = parseDdl(PG_DDL);
    const posts = schema.tables.find((t) => t.name === "posts")!;
    const userId = posts.columns.find((c) => c.name === "user_id")!;
    expect(userId.fk).toBe(true);
    expect(userId.referencesTable).toBe("users");
    expect(userId.referencesColumn).toBe("id");
  });

  it("detects UNIQUE and NOT NULL constraints", () => {
    const schema = parseDdl(PG_DDL);
    const users = schema.tables.find((t) => t.name === "users")!;
    const email = users.columns.find((c) => c.name === "email")!;
    expect(email.unique).toBe(true);
    expect(email.nullable).toBe(false);
    const name = users.columns.find((c) => c.name === "name")!;
    expect(name.nullable).toBe(true);
  });
});

// ─── MySQL parsing ─────────────────────────────────────────────────────────

describe("parseDdl — MySQL / XAMPP", () => {
  const MYSQL_DDL = `
    CREATE TABLE \`users\` (
      \`id\` INT AUTO_INCREMENT PRIMARY KEY,
      \`email\` VARCHAR(255) NOT NULL,
      UNIQUE (\`email\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

    CREATE TABLE \`posts\` (
      \`id\` INT AUTO_INCREMENT PRIMARY KEY,
      \`user_id\` INT NOT NULL,
      \`title\` VARCHAR(255) NOT NULL,
      CONSTRAINT \`fk_posts_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`)
    ) ENGINE=InnoDB;
  `;

  it("parses backtick-quoted tables", () => {
    const schema = parseDdl(MYSQL_DDL);
    expect(schema.tables.map((t) => t.name).sort()).toEqual(["posts", "users"]);
  });

  it("detects ENGINE=InnoDB", () => {
    const schema = parseDdl(MYSQL_DDL);
    expect(schema.tables.every((t) => t.engine === "InnoDB")).toBe(true);
  });

  it("detects table-level UNIQUE constraint", () => {
    const schema = parseDdl(MYSQL_DDL);
    const users = schema.tables.find((t) => t.name === "users")!;
    const email = users.columns.find((c) => c.name === "email")!;
    expect(email.unique).toBe(true);
  });

  it("detects CONSTRAINT ... FOREIGN KEY block", () => {
    const schema = parseDdl(MYSQL_DDL);
    const posts = schema.tables.find((t) => t.name === "posts")!;
    const userId = posts.columns.find((c) => c.name === "user_id")!;
    expect(userId.fk).toBe(true);
    expect(userId.referencesTable).toBe("users");
    expect(userId.referencesColumn).toBe("id");
  });
});

// ─── SQLite parsing ────────────────────────────────────────────────────────

describe("parseDdl — SQLite", () => {
  const SQLITE_DDL = `
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL
    );

    CREATE TABLE posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      title TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `;

  it("parses SQLite tables", () => {
    const schema = parseDdl(SQLITE_DDL);
    expect(schema.tables).toHaveLength(2);
  });

  it("detects INTEGER PRIMARY KEY as autoincrement", () => {
    const schema = parseDdl(SQLITE_DDL);
    const users = schema.tables.find((t) => t.name === "users")!;
    const id = users.columns.find((c) => c.name === "id")!;
    expect(id.pk).toBe(true);
    expect(id.autoIncrement).toBe(true);
  });

  it("detects table-level FOREIGN KEY constraint", () => {
    const schema = parseDdl(SQLITE_DDL);
    const posts = schema.tables.find((t) => t.name === "posts")!;
    const userId = posts.columns.find((c) => c.name === "user_id")!;
    expect(userId.fk).toBe(true);
    expect(userId.referencesTable).toBe("users");
  });
});

// ─── Bracket-quoted identifiers (SQL Server style) ─────────────────────────

describe("parseDdl — bracket-quoted identifiers", () => {
  it("accepts [bracket] quoted names", () => {
    const ddl = `
      CREATE TABLE [users] (
        [id] INT PRIMARY KEY,
        [name] TEXT
      );
    `;
    const schema = parseDdl(ddl);
    expect(schema.tables[0].name).toBe("users");
    expect(schema.tables[0].columns.map((c) => c.name)).toEqual(["id", "name"]);
  });
});

// ─── ALTER TABLE FK extraction ─────────────────────────────────────────────

describe("parseDdl — standalone ALTER TABLE FK", () => {
  it("picks up FKs from ALTER TABLE ... ADD FOREIGN KEY", () => {
    const ddl = `
      CREATE TABLE users (id SERIAL PRIMARY KEY);
      CREATE TABLE posts (id SERIAL PRIMARY KEY, user_id INTEGER);
      ALTER TABLE posts ADD CONSTRAINT fk_posts_user FOREIGN KEY (user_id) REFERENCES users(id);
    `;
    const schema = parseDdl(ddl);
    const posts = schema.tables.find((t) => t.name === "posts")!;
    const userId = posts.columns.find((c) => c.name === "user_id")!;
    expect(userId.fk).toBe(true);
    expect(userId.referencesTable).toBe("users");
  });
});

// ─── Cardinality detection ─────────────────────────────────────────────────

describe("detectCardinality", () => {
  it("returns one-to-one for a UNIQUE FK column", () => {
    const col = { name: "user_id", type: "INTEGER", pk: false, fk: true, unique: true, nullable: true };
    expect(detectCardinality(col as never)).toBe("one-to-one");
  });

  it("returns one-to-many for a non-unique FK column", () => {
    const col = { name: "user_id", type: "INTEGER", pk: false, fk: true, unique: false, nullable: true };
    expect(detectCardinality(col as never)).toBe("one-to-many");
  });
});
