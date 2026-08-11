import { describe, expect, test } from "bun:test";
import { SQLiteDialect } from "drizzle-orm/sqlite-core";
import type { SQL } from "drizzle-orm";
import { search } from "./search";
import type { Db } from "./db";

describe("search", () => {
  const dialect = new SQLiteDialect();

  function mockDb(resultSets: unknown[][]) {
    const allCalls: SQL[] = [];
    let callIndex = 0;

    const db = {
      all(query: SQL) {
        allCalls.push(query);
        return Promise.resolve(resultSets[callIndex++] ?? []);
      },
    } as unknown as Db;

    return { db, allCalls };
  }

  function sqlString(sql: SQL): { sql: string; params: unknown[] } {
    return dialect.sqlToQuery(sql);
  }

  test("returns empty hits for empty query", async () => {
    const { db, allCalls } = mockDb([]);
    const result = await search(db, "");
    expect(result.hits).toEqual([]);
    expect(allCalls.length).toBe(0);
  });

  test("queries prefix FTS5 table", async () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({
      name: `pkg-${i}`,
      summary: null,
      version: null,
      downloads_4w: i,
      import_names: null,
    }));
    const { db, allCalls } = mockDb([rows]);
    await search(db, "django");
    expect(allCalls.length).toBe(1);
    const { sql: rendered } = sqlString(allCalls[0]);
    expect(rendered).toContain("pkg_prefix");
    expect(rendered).toContain("MATCH");
    expect(rendered).toContain("rank");
  });

  test("uses FTS5 prefix expression with wildcard", async () => {
    const { db, allCalls } = mockDb([[]]);
    await search(db, "django");
    const { params } = sqlString(allCalls[0]);
    expect(params).toContain('"django"*');
  });

  test("maps db rows to search hits with camelCase to snake_case", async () => {
    const row = {
      name: "django",
      summary: "A web framework",
      version: "5.0",
      downloads_4w: 123,
      import_names: JSON.stringify(["django"]),
    };
    const { db } = mockDb([[row]]);
    const result = await search(db, "django");
    expect(result.hits).toEqual([
      { name: "django", summary: "A web framework", version: "5.0", downloads_4w: 123, import_names: ["django"] },
    ]);
  });

  test("lowercases and normalizes input", async () => {
    const { db, allCalls } = mockDb([[]]);
    await search(db, "Django_Rest-Framework");
    const { params } = sqlString(allCalls[0]);
    expect(params).toContain('"django-rest-framework"*');
  });

  test("falls back to trigram FTS5 when prefix returns few hits", async () => {
    const prefixRows = Array.from({ length: 2 }, (_, i) => ({
      name: `pkg-${i}`,
      summary: null,
      version: null,
      downloads_4w: i,
      import_names: null,
    }));
    const trigramRows = Array.from({ length: 5 }, (_, i) => ({
      name: `trigram-${i}`,
      summary: null,
      version: null,
      downloads_4w: i,
      import_names: null,
    }));
    const { db, allCalls } = mockDb([prefixRows, trigramRows]);
    const result = await search(db, "django");
    expect(allCalls.length).toBe(2);
    const { sql: rendered } = sqlString(allCalls[1]);
    expect(rendered).toContain("pkg_trigram");
    expect(result.hits.length).toBe(7);
  });

  test("deduplicates between prefix and trigram results", async () => {
    const dup = { name: "duplicate", summary: null, version: null, downloads_4w: 10, import_names: null };
    const prefixRows = [dup];
    const trigramRows = [dup, {
      name: "other",
      summary: null,
      version: null,
      downloads_4w: 5,
      import_names: null,
    }];
    const { db } = mockDb([prefixRows, trigramRows]);
    const result = await search(db, "django");
    expect(result.hits.length).toBe(2);
    expect(result.hits[0].name).toBe("duplicate");
    expect(result.hits[1].name).toBe("other");
  });

  test("strips special characters from input before FTS5 match", async () => {
    const { db, allCalls } = mockDb([[]]);
    await search(db, 'test"query');
    const { params } = sqlString(allCalls[0]);
    expect(params).toContain('"testquery"*');
  });

  test("escapes quotes defensively in FTS5 expression", async () => {
    const { db, allCalls } = mockDb([[]]);
    await search(db, 'django~');
    const { params } = sqlString(allCalls[0]);
    expect(params).toContain('"django"*');
  });
});
