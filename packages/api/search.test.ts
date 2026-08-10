import { describe, expect, test } from "bun:test";
import { SQLiteDialect } from "drizzle-orm/sqlite-core";
import { search } from "./search";
import type { Db } from "./db";

describe("search", () => {
  const dialect = new SQLiteDialect();

  function mockDb<T extends unknown[]>(...results: T[]) {
    const selectCalls: { where?: unknown; orderBy?: unknown[]; limit?: unknown }[] = [];
    let resultIndex = 0;

    function builder() {
      const chain = {
        from() {
          return chain;
        },
        where(where: unknown) {
          selectCalls[resultIndex] = { ...selectCalls[resultIndex], where };
          return chain;
        },
        orderBy(...orderBy: unknown[]) {
          selectCalls[resultIndex] = { ...selectCalls[resultIndex], orderBy };
          return chain;
        },
        limit(limit: unknown) {
          selectCalls[resultIndex] = { ...selectCalls[resultIndex], limit };
          resultIndex += 1;
          return Promise.resolve(results[resultIndex - 1] ?? []);
        },
      };
      return chain;
    }

    const db = {
      select() {
        return builder();
      },
    } as unknown as Db;

    return { db, selectCalls };
  }

  test("returns empty hits for empty query", async () => {
    const { db, selectCalls } = mockDb([]);
    const result = await search(db, "");
    expect(result.hits).toEqual([]);
    expect(selectCalls.length).toBe(0);
  });

  test("runs one query per search when results fill the page", async () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({
      name: `pkg-${i}`,
      summary: null,
      version: null,
      downloads4w: i,
      importNames: null,
    }));
    const { db, selectCalls } = mockDb(rows);
    await search(db, "django");
    expect(selectCalls.length).toBe(1);
  });

  test("returns typed rows with camelCase import_names mapped to snake_case", async () => {
    const row = { name: "django", summary: "A web framework", version: "5.0", downloads4w: 123, importNames: ["django"] };
    const { db } = mockDb([row]);
    const result = await search(db, "django");
    expect(result.hits).toEqual([
      { name: "django", summary: "A web framework", version: "5.0", downloads_4w: 123, import_names: ["django"] },
    ]);
  });

  test("lowercases input before building the query", async () => {
    const { db, selectCalls } = mockDb([]);
    await search(db, "DJANGO");
    const { params } = dialect.sqlToQuery(selectCalls[0].where as never);
    expect(params).toContain("django");
  });

  test("normalizes separators in the query before matching", async () => {
    const { db, selectCalls } = mockDb([]);
    await search(db, "Django_Rest-Framework");
    const { params } = dialect.sqlToQuery(selectCalls[0].where as never);
    expect(params).toContain("django-rest-framework");
  });

  test("re-ranks by normalized exact match then downloads", async () => {
    const { db, selectCalls } = mockDb([]);
    await search(db, "django");
    const { sql: rendered } = dialect.sqlToQuery(selectCalls[0].where as never);
    expect(rendered).toContain("normalized_name");
    expect(rendered).toContain("GLOB");
    expect(selectCalls[0].limit).toBe(20);
  });

  test("falls back to a LIKE query when the primary query is short on hits", async () => {
    const row = { name: "django", summary: "A web framework", version: "5.0", downloads4w: 123, importNames: ["django"] };
    const { db, selectCalls } = mockDb([], [row]);
    const result = await search(db, "django");
    expect(selectCalls.length).toBe(2);
    const { sql: rendered } = dialect.sqlToQuery(selectCalls[1].where as never);
    expect(rendered).toContain("like");
    expect(result.hits).toEqual([
      { name: "django", summary: "A web framework", version: "5.0", downloads_4w: 123, import_names: ["django"] },
    ]);
  });
});
