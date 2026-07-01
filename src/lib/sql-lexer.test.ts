import { describe, expect, it } from "vitest";
import { lexSql, parseTokens, parseDdlLexed } from "./sql-lexer";
import { detectDialect, type ParsedSchema } from "./sql-tokenizer";

// ─── Character lexer tests ──────────────────────────────────────────────────

describe("lexSql — character-by-character tokenization", () => {
  it("tokenizes a simple CREATE TABLE statement", () => {
    const tokens = lexSql("CREATE TABLE users (id INT PRIMARY KEY);");
    const values = tokens.map((t) => t.value);
    expect(values).toContain("CREATE");
    expect(values).toContain("TABLE");
    expect(values).toContain("users");
    expect(values).toContain("id");
    expect(values).toContain("INT");
    expect(values).toContain("PRIMARY");
    expect(values).toContain("KEY");
  });

  it("strips line comments (-- ...)", () => {
    const tokens = lexSql("-- this is a comment\nCREATE TABLE t (id INT);");
    const values = tokens.map((t) => t.value);
    expect(values).not.toContain("this");
    expect(values).not.toContain("comment");
    expect(values).toContain("CREATE");
  });

  it("strips block comments (/* ... */)", () => {
    const tokens = lexSql("/* multi\nline\ncomment */ CREATE TABLE t (id INT);");
    const values = tokens.map((t) => t.value);
    expect(values).not.toContain("multi");
    expect(values).not.toContain("comment");
    expect(values).toContain("CREATE");
  });

  it("strips MySQL hash comments (# ...)", () => {
    const tokens = lexSql("# hash comment\nCREATE TABLE t (id INT);");
    const values = tokens.map((t) => t.value);
    expect(values).not.toContain("hash");
    expect(values).toContain("CREATE");
  });

  it("normalizes irregular tabs and whitespace", () => {
    const tokens = lexSql("CREATE\tTABLE\t\t  users  (\tid\tINT\t);");
    const values = tokens.map((t) => t.value);
    expect(values).toContain("CREATE");
    expect(values).toContain("TABLE");
    expect(values).toContain("users");
    expect(values).toContain("id");
    expect(values).toContain("INT");
  });

  it("handles lowercase keywords", () => {
    const tokens = lexSql("create table users (id int primary key);");
    const keywords = tokens.filter((t) => t.type === "keyword").map((t) => t.upper);
    expect(keywords).toContain("CREATE");
    expect(keywords).toContain("TABLE");
    expect(keywords).toContain("PRIMARY");
    expect(keywords).toContain("KEY");
  });

  it("handles mixed-case keywords", () => {
    const tokens = lexSql("Create Table Users (Id Int Primary Key);");
    const keywords = tokens.filter((t) => t.type === "keyword").map((t) => t.upper);
    expect(keywords).toContain("CREATE");
    expect(keywords).toContain("TABLE");
  });

  it("recognizes backtick-quoted identifiers", () => {
    const tokens = lexSql("CREATE TABLE `users` (`id` INT);");
    const idents = tokens.filter((t) => t.type === "identifier").map((t) => t.value);
    expect(idents).toContain("users");
    expect(idents).toContain("id");
  });

  it("recognizes double-quote-quoted identifiers", () => {
    const tokens = lexSql('CREATE TABLE "users" ("id" INT);');
    const idents = tokens.filter((t) => t.type === "identifier").map((t) => t.value);
    expect(idents).toContain("users");
    expect(idents).toContain("id");
  });

  it("recognizes bracket-quoted identifiers", () => {
    const tokens = lexSql("CREATE TABLE [users] ([id] INT);");
    const idents = tokens.filter((t) => t.type === "identifier").map((t) => t.value);
    expect(idents).toContain("users");
    expect(idents).toContain("id");
  });

  it("tokenizes type parameters as separate number tokens", () => {
    const tokens = lexSql("CREATE TABLE t (name VARCHAR(255));");
    const numbers = tokens.filter((t) => t.type === "number").map((t) => t.value);
    expect(numbers).toContain("255");
    const idents = tokens.filter((t) => t.type === "identifier").map((t) => t.value);
    expect(idents).toContain("VARCHAR");
  });

  it("tracks line numbers correctly", () => {
    const tokens = lexSql("CREATE TABLE t (\n  id INT\n);");
    const idTok = tokens.find((t) => t.value === "id");
    expect(idTok?.line).toBe(2);
  });
});

// ─── Token-stream parser tests ──────────────────────────────────────────────

describe("parseTokens — structured grouping", () => {
  it("groups CREATE TABLE with columns and types", () => {
    const tokens = lexSql("CREATE TABLE users (id INT PRIMARY KEY, name TEXT NOT NULL);");
    const schema = parseTokens(tokens, "postgresql");
    expect(schema.tables).toHaveLength(1);
    expect(schema.tables[0].name).toBe("users");
    expect(schema.tables[0].columns).toHaveLength(2);
    expect(schema.tables[0].columns[0].name).toBe("id");
    expect(schema.tables[0].columns[0].type).toBe("INTEGER");
    expect(schema.tables[0].columns[0].pk).toBe(true);
    expect(schema.tables[0].columns[1].name).toBe("name");
    expect(schema.tables[0].columns[1].type).toBe("TEXT");
    expect(schema.tables[0].columns[1].nullable).toBe(false);
  });

  it("groups inline FOREIGN KEY REFERENCES", () => {
    const ddl = `
      CREATE TABLE posts (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        title TEXT NOT NULL
      );
    `;
    const tokens = lexSql(ddl);
    const schema = parseTokens(tokens, "postgresql");
    const posts = schema.tables[0];
    const userId = posts.columns.find((c) => c.name === "user_id")!;
    expect(userId.fk).toBe(true);
    expect(userId.referencesTable).toBe("users");
    expect(userId.referencesColumn).toBe("id");
  });

  it("groups table-level FOREIGN KEY constraints", () => {
    const ddl = `
      CREATE TABLE posts (
        id SERIAL PRIMARY KEY,
        user_id INTEGER,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
    `;
    const tokens = lexSql(ddl);
    const schema = parseTokens(tokens, "postgresql");
    const posts = schema.tables[0];
    const userId = posts.columns.find((c) => c.name === "user_id")!;
    expect(userId.fk).toBe(true);
    expect(userId.referencesTable).toBe("users");
  });

  it("groups table-level UNIQUE constraints", () => {
    const ddl = `
      CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        email TEXT,
        UNIQUE (email)
      );
    `;
    const tokens = lexSql(ddl);
    const schema = parseTokens(tokens, "postgresql");
    const email = schema.tables[0].columns.find((c) => c.name === "email")!;
    expect(email.unique).toBe(true);
  });

  it("groups ALTER TABLE ... ADD FOREIGN KEY", () => {
    const ddl = `
      CREATE TABLE users (id SERIAL PRIMARY KEY);
      CREATE TABLE posts (id SERIAL PRIMARY KEY, user_id INTEGER);
      ALTER TABLE posts ADD CONSTRAINT fk_post_user FOREIGN KEY (user_id) REFERENCES users(id);
    `;
    const tokens = lexSql(ddl);
    const schema = parseTokens(tokens, "postgresql");
    const posts = schema.tables.find((t) => t.name === "posts")!;
    const userId = posts.columns.find((c) => c.name === "user_id")!;
    expect(userId.fk).toBe(true);
    expect(userId.referencesTable).toBe("users");
  });

  it("handles lowercase DDL", () => {
    const ddl = `
      create table users (
        id serial primary key,
        email text unique not null
      );
    `;
    const tokens = lexSql(ddl);
    const schema = parseTokens(tokens, "postgresql");
    expect(schema.tables[0].name).toBe("users");
    expect(schema.tables[0].columns[0].pk).toBe(true);
    expect(schema.tables[0].columns[1].unique).toBe(true);
  });

  it("detects MySQL ENGINE=InnoDB", () => {
    const ddl = "CREATE TABLE users (id INT PRIMARY KEY) ENGINE=InnoDB;";
    const tokens = lexSql(ddl);
    const schema = parseTokens(tokens, "mysql");
    expect(schema.tables[0].engine).toBe("InnoDB");
  });
});

// ─── Full pipeline: parseDdlLexed ────────────────────────────────────────────

describe("parseDdlLexed — full character-lexer pipeline", () => {
  it("parses PostgreSQL DDL with comments and irregular whitespace", () => {
    const ddl = `
      -- Users table
      CREATE TABLE users (
        id   SERIAL   PRIMARY KEY,   -- auto-increment PK
        email   TEXT   UNIQUE   NOT NULL,
        name TEXT
      );

      /* Posts table
         with FK to users */
      CREATE TABLE posts (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        title TEXT NOT NULL,
        body TEXT
      );
    `;
    const schema = parseDdlLexed(ddl);
    expect(schema.tables).toHaveLength(2);
    expect(schema.tables.map((t) => t.name).sort()).toEqual(["posts", "users"]);

    const posts = schema.tables.find((t) => t.name === "posts")!;
    const userId = posts.columns.find((c) => c.name === "user_id")!;
    expect(userId.fk).toBe(true);
    expect(userId.referencesTable).toBe("users");
  });

  it("parses MySQL DDL with backticks and ENGINE", () => {
    const ddl = `
      CREATE TABLE \`users\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`email\` VARCHAR(255) NOT NULL,
        UNIQUE (\`email\`)
      ) ENGINE=InnoDB;
    `;
    const schema = parseDdlLexed(ddl);
    expect(schema.tables[0].name).toBe("users");
    expect(schema.tables[0].engine).toBe("InnoDB");
    const email = schema.tables[0].columns.find((c) => c.name === "email")!;
    expect(email.unique).toBe(true);
  });

  it("parses SQLite DDL with AUTOINCREMENT", () => {
    const ddl = `
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL
      );
    `;
    const schema = parseDdlLexed(ddl);
    const id = schema.tables[0].columns.find((c) => c.name === "id")!;
    expect(id.pk).toBe(true);
    expect(id.autoIncrement).toBe(true);
  });

  it("parses lowercase DDL", () => {
    const ddl = `
      create table users (
        id serial primary key,
        email text unique not null
      );

      create table posts (
        id serial primary key,
        user_id integer references users(id),
        title text not null
      );
    `;
    const schema = parseDdlLexed(ddl);
    expect(schema.tables).toHaveLength(2);
    const posts = schema.tables.find((t) => t.name === "posts")!;
    const userId = posts.columns.find((c) => c.name === "user_id")!;
    expect(userId.fk).toBe(true);
    expect(userId.referencesTable).toBe("users");
  });

  it("produces output compatible with the existing ParsedSchema type", () => {
    const ddl = "CREATE TABLE users (id SERIAL PRIMARY KEY, name TEXT);";
    const schema: ParsedSchema = parseDdlLexed(ddl);
    expect(schema.tables).toBeDefined();
    expect(schema.dialect).toBeDefined();
    expect(schema.tables[0].columns).toBeDefined();
  });
});
