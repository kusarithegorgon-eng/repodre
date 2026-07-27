import { describe, it, expect } from "vitest";
import { exportErdToMermaid, exportAppToMermaid, exportToMermaid } from "./mermaid-export";
import type { Node, Edge } from "./db-client";

function makeNode(overrides: Partial<Node>): Node {
  return {
    id: overrides.id ?? "n1",
    label: overrides.label ?? "Users",
    sub: "",
    shape: overrides.shape ?? "rectangle",
    accent: "blue",
    projectId: "p1",
    workspace: overrides.workspace ?? "erd",
    columns: overrides.columns ?? null,
    tableName: overrides.tableName ?? null,
    sectionId: null,
    x: 0,
    y: 0,
  };
}

function makeEdge(overrides: Partial<Edge>): Edge {
  return {
    id: overrides.id ?? "e1",
    projectId: "p1",
    from: overrides.from ?? "n1",
    to: overrides.to ?? "n2",
    cardinality: overrides.cardinality,
    fromColumn: overrides.fromColumn,
    toColumn: overrides.toColumn,
  };
}

describe("mermaid-export", () => {
  describe("exportErdToMermaid", () => {
    it("generates an erDiagram with table definitions and columns", () => {
      const nodes: Node[] = [
        makeNode({
          id: "t1",
          tableName: "users",
          columns: [
            { name: "id", type: "uuid", pk: true, fk: false, unique: false, nullable: false },
            { name: "email", type: "varchar", pk: false, fk: false, unique: true, nullable: false },
          ],
        }),
        makeNode({
          id: "t2",
          tableName: "posts",
          columns: [
            { name: "id", type: "uuid", pk: true, fk: false, unique: false, nullable: false },
            { name: "author_id", type: "uuid", pk: false, fk: true, unique: false, nullable: false },
          ],
        }),
      ];
      const edges: Edge[] = [
        makeEdge({
          from: "t2",
          to: "t1",
          cardinality: "one-to-many",
          fromColumn: "author_id",
          toColumn: "id",
        }),
      ];

      const result = exportErdToMermaid(nodes, edges);

      expect(result).toContain("erDiagram");
      expect(result).toContain("users {");
      expect(result).toContain("UUID id PK");
      expect(result).toContain("posts {");
      expect(result).toContain("UUID author_id FK");
      // Relationship line
      expect(result).toContain("posts ||--o{ users");
      expect(result).toContain("author_id -> id");
    });

    it("handles many-to-many cardinality", () => {
      const nodes: Node[] = [
        makeNode({ id: "a", tableName: "students", columns: [{ name: "id", type: "int", pk: true, fk: false, unique: false, nullable: false }] }),
        makeNode({ id: "b", tableName: "courses", columns: [{ name: "id", type: "int", pk: true, fk: false, unique: false, nullable: false }] }),
      ];
      const edges: Edge[] = [
        makeEdge({ from: "a", to: "b", cardinality: "many-to-many", fromColumn: "student_id", toColumn: "course_id" }),
      ];

      const result = exportErdToMermaid(nodes, edges);
      expect(result).toContain("}o--o{");
    });

    it("sanitizes unsafe table names", () => {
      const nodes: Node[] = [
        makeNode({ id: "x", tableName: "user-profiles!", columns: [{ name: "id", type: "int", pk: true, fk: false, unique: false, nullable: false }] }),
      ];
      const result = exportErdToMermaid(nodes, []);
      expect(result).toContain("user_profiles_ {");
    });

    it("skips edges without cardinality or column info", () => {
      const nodes: Node[] = [
        makeNode({ id: "a", tableName: "a", columns: [{ name: "id", type: "int", pk: true, fk: false, unique: false, nullable: false }] }),
        makeNode({ id: "b", tableName: "b", columns: [{ name: "id", type: "int", pk: true, fk: false, unique: false, nullable: false }] }),
      ];
      const edges: Edge[] = [makeEdge({ from: "a", to: "b" })]; // no cardinality
      const result = exportErdToMermaid(nodes, edges);
      expect(result).not.toContain("a ||--");
    });
  });

  describe("exportAppToMermaid", () => {
    it("generates a flowchart with shape-appropriate node syntax", () => {
      const nodes: Node[] = [
        makeNode({ id: "n1", label: "API Controller", shape: "rectangle", workspace: "app" }),
        makeNode({ id: "n2", label: "Is Admin?", shape: "diamond", workspace: "app" }),
        makeNode({ id: "n3", label: "Database", shape: "cylinder", workspace: "app" }),
      ];
      const edges: Edge[] = [
        makeEdge({ from: "n1", to: "n2" }),
        makeEdge({ from: "n2", to: "n3", cardinality: "one-to-many" }),
      ];

      const result = exportAppToMermaid(nodes, edges);
      expect(result).toContain("flowchart TD");
      // Rectangle → [label]
      expect(result).toContain("n1[API Controller]");
      // Diamond → {label}
      expect(result).toContain("n2{Is Admin?}");
      // Cylinder → [("label")]
      expect(result).toContain('n3[("Database")]');
      // Edges
      expect(result).toContain("n1 --> n2");
      expect(result).toContain("n2 -->|one-to-many| n3");
    });

    it("uses pill and circle syntax for those shapes", () => {
      const nodes: Node[] = [
        makeNode({ id: "p1", label: "View", shape: "pill", workspace: "app" }),
        makeNode({ id: "c1", label: "Bridge", shape: "circle", workspace: "app" }),
      ];
      const result = exportAppToMermaid(nodes, []);
      expect(result).toContain("p1([View])");
      expect(result).toContain("c1((Bridge))");
    });
  });

  describe("exportToMermaid dispatcher", () => {
    it("routes to erDiagram for erd workspace", () => {
      const nodes: Node[] = [makeNode({ workspace: "erd", tableName: "t", columns: [{ name: "id", type: "int", pk: true, fk: false, unique: false, nullable: false }] })];
      const result = exportToMermaid(nodes, [], "erd");
      expect(result.startsWith("erDiagram")).toBe(true);
    });

    it("routes to flowchart for app workspace", () => {
      const nodes: Node[] = [makeNode({ workspace: "app", shape: "rectangle" })];
      const result = exportToMermaid(nodes, [], "app");
      expect(result.startsWith("flowchart TD")).toBe(true);
    });
  });
});
