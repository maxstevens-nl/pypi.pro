import { describe, expect, test } from "bun:test";
import { PgDialect } from "drizzle-orm/pg-core";
import { search } from "./search";
import type { Db } from "./db";

describe("search", () => {
  const dialect = new PgDialect();

  test("returns empty hits for empty query", async () => {
    const executed: unknown[] = [];
    const db = {
      execute(query: unknown) {
        executed.push(query);
        return Promise.resolve([]);
      },
    } as unknown as Db;

    const result = await search(db, "");
    expect(result.hits).toEqual([]);
    expect(executed.length).toBe(0);
  });

  test("calls db.execute once per search", async () => {
    const executed: unknown[] = [];
    const db = {
      execute(query: unknown) {
        executed.push(query);
        return Promise.resolve([]);
      },
    } as unknown as Db;

    await search(db, "django");
    expect(executed.length).toBe(1);
  });

  test("returns typed rows including downloads_4w", async () => {
    const hits = [
      { name: "django", summary: "A web framework", version: "5.0", downloads_4w: 123 },
    ];
    const db = {
      execute() {
        return Promise.resolve(hits);
      },
    } as unknown as Db;

    const result = await search(db, "django");
    expect(result.hits).toEqual(hits);
  });

  test("lowercases input before building the query", async () => {
    const params: unknown[] = [];
    const db = {
      execute(query: unknown) {
        params.push(query);
        return Promise.resolve([]);
      },
    } as unknown as Db;

    await search(db, "DJANGO");
    const { params: values } = dialect.sqlToQuery(params[0] as never);
    expect(values).toContain("django");
  });

  test("uses only the BM25 index, no prefix or trigram legs", async () => {
    const params: unknown[] = [];
    const db = {
      execute(query: unknown) {
        params.push(query);
        return Promise.resolve([]);
      },
    } as unknown as Db;

    await search(db, "django");
    const { sql: rendered } = dialect.sqlToQuery(params[0] as never);
    expect(rendered).toContain("to_bm25query");
    expect(rendered).not.toContain("LIKE");
    expect(rendered).not.toContain("similarity");
  });

  test("re-ranks by normalized exact match then downloads", async () => {
    const params: unknown[] = [];
    const db = {
      execute(query: unknown) {
        params.push(query);
        return Promise.resolve([]);
      },
    } as unknown as Db;

    await search(db, "django");
    const { sql: rendered } = dialect.sqlToQuery(params[0] as never);
    expect(rendered).toContain("normalized_name = ");
    expect(rendered).toContain("downloads_4w DESC NULLS LAST");
    expect(rendered).toContain("LIMIT 100");
    expect(rendered).toContain("LIMIT 20");
  });

  test("normalizes separators in the query before matching", async () => {
    const params: unknown[] = [];
    const db = {
      execute(query: unknown) {
        params.push(query);
        return Promise.resolve([]);
      },
    } as unknown as Db;

    await search(db, "Django_Rest-Framework");
    const { params: values } = dialect.sqlToQuery(params[0] as never);
    expect(values).toContain("django-rest-framework");
  });
});
