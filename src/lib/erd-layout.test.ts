import { describe, expect, it } from "vitest";
import {
  layoutErd,
  tableHeight,
  ERD_HEADER_HEIGHT,
  ERD_ROW_HEIGHT,
  ERD_TABLE_WIDTH,
  type ErdColumnRow,
} from "./erd-layout";

function makeColumns(n: number): ErdColumnRow[] {
  return Array.from({ length: n }, (_, i) => ({
    name: `col_${i}`,
    type: "INTEGER",
    pk: i === 0,
    fk: false,
    unique: false,
    nullable: true,
  }));
}

describe("tableHeight", () => {
  it("scales with column count", () => {
    const h1 = tableHeight(1);
    const h3 = tableHeight(3);
    const h5 = tableHeight(5);
    expect(h3 - h1).toBe(2 * ERD_ROW_HEIGHT);
    expect(h5 - h3).toBe(2 * ERD_ROW_HEIGHT);
  });

  it("includes the header height", () => {
    expect(tableHeight(0)).toBeGreaterThanOrEqual(ERD_HEADER_HEIGHT);
  });
});

describe("layoutErd — grid placement", () => {
  const tables = [
    { id: "t1", name: "users", columns: makeColumns(2) },
    { id: "t2", name: "posts", columns: makeColumns(3) },
    { id: "t3", name: "comments", columns: makeColumns(2) },
  ];

  const layout = layoutErd(tables, []);

  it("places tables on a wrapped grid (max 3 per row)", () => {
    expect(layout.tables).toHaveLength(3);
    // first three tables should be in one row (x increasing, same y)
    const ys = layout.tables.map((t) => t.y);
    expect(new Set(ys).size).toBeLessThanOrEqual(2); // at most 2 rows for 3 tables
  });

  it("assigns each table the standard width", () => {
    for (const t of layout.tables) {
      expect(t.width).toBe(ERD_TABLE_WIDTH);
    }
  });

  it("assigns each table a height matching its column count", () => {
    for (const t of layout.tables) {
      expect(t.height).toBe(tableHeight(t.columns.length));
    }
  });

  it("sorts tables by name for deterministic placement", () => {
    const names = layout.tables.map((t) => t.name);
    expect(names).toEqual(["comments", "posts", "users"]);
  });

  it("produces non-overlapping positions", () => {
    const positions = layout.tables.map((t) => `${t.x},${t.y}`);
    expect(new Set(positions).size).toBe(positions.length);
  });
});

describe("layoutErd — orthogonal edge routing", () => {
  const tables = [
    { id: "t1", name: "users", columns: [
      { name: "id", type: "INTEGER", pk: true, fk: false, unique: false, nullable: false },
    ]},
    { id: "t2", name: "profiles", columns: [
      { name: "id", type: "INTEGER", pk: true, fk: false, unique: false, nullable: false },
      { name: "user_id", type: "INTEGER", pk: false, fk: true, unique: true, nullable: true },
    ]},
  ];

  const edges = [
    {
      id: "e1",
      fromTableId: "t2",
      toTableId: "t1",
      fromColumn: "user_id",
      toColumn: "id",
      cardinality: "one-to-one" as const,
    },
  ];

  const layout = layoutErd(tables, edges);

  it("routes an edge with an orthogonal path (L commands, not C)", () => {
    expect(layout.edges).toHaveLength(1);
    const path = layout.edges[0].path;
    expect(path).toContain("M ");
    expect(path).toContain(" L ");
    expect(path).not.toContain("C "); // no cubic beziers
  });

  it("anchors the from-marker on the source table's FK column row", () => {
    const fromTable = layout.tables.find((t) => t.id === "t2")!;
    const edge = layout.edges[0];
    // user_id is row index 1 (0-based) in profiles
    const expectedY = fromTable.y + ERD_HEADER_HEIGHT + 1 * ERD_ROW_HEIGHT + ERD_ROW_HEIGHT / 2;
    expect(edge.fromMarker.y).toBeCloseTo(expectedY, 5);
  });

  it("anchors the to-marker on the target table's PK column row", () => {
    const toTable = layout.tables.find((t) => t.id === "t1")!;
    const edge = layout.edges[0];
    // id is row index 0 in users
    const expectedY = toTable.y + ERD_HEADER_HEIGHT + 0 * ERD_ROW_HEIGHT + ERD_ROW_HEIGHT / 2;
    expect(edge.toMarker.y).toBeCloseTo(expectedY, 5);
  });

  it("preserves cardinality on the edge", () => {
    expect(layout.edges[0].cardinality).toBe("one-to-one");
  });
});

describe("layoutErd — empty input", () => {
  it("returns empty arrays for no tables", () => {
    const layout = layoutErd([], []);
    expect(layout.tables).toEqual([]);
    expect(layout.edges).toEqual([]);
  });

  it("drops edges referencing unknown tables", () => {
    const layout = layoutErd(
      [{ id: "t1", name: "users", columns: makeColumns(1) }],
      [{
        id: "e1",
        fromTableId: "t1",
        toTableId: "missing",
        fromColumn: "id",
        toColumn: "id",
        cardinality: "one-to-many",
      }]
    );
    expect(layout.edges).toHaveLength(0);
  });
});
