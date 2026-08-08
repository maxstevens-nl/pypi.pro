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

  test("returns typed rows", async () => {
    const hits = [
      { name: "django", summary: "A web framework", version: "5.0" },
    ];
    const db = {
      execute() {
        return Promise.resolve(hits);
      },
    } as unknown as Db;

    const result = await search(db, "django");
    expect(result.hits).toEqual(hits);
  });

  test("lowercases input", async () => {
    const params: unknown[] = [];
    const db = {
      execute(query: unknown) {
        params.push(query);
        return Promise.resolve([]);
      },
    } as unknown as Db;

    await search(db, "DJANGO");
    const { params: values } = dialect.sqlToQuery(params[0] as never);
    expect(values).toContain("django%");
  });

  test("single char disables trgm and fts legs in query", async () => {
    const params: unknown[] = [];
    const db = {
      execute(query: unknown) {
        params.push(query);
        return Promise.resolve([]);
      },
    } as unknown as Db;

    await search(db, "a");
    const { params: values } = dialect.sqlToQuery(params[0] as never);
    expect(values).toContain(false);
  });
});
