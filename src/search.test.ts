import { describe, expect, test } from "bun:test";
import { PgDialect } from "drizzle-orm/pg-core";
import { search } from "./search";
import type { Db } from "./db";

describe("search", () => {
  test("matches and ranks package names case-insensitively", async () => {
    const dialect = new PgDialect();
    let exact: unknown;
    let order: unknown;

    const db = {
      select(selection: Record<string, unknown>) {
        exact = selection.exact;
        return {
          from() {
            return {
              where() {
                return {
                  orderBy(...expressions: unknown[]) {
                    order = expressions[0];
                    return { limit: async () => [] };
                  },
                };
              },
            };
          },
        };
      },
    } as unknown as Db;

    await search(db, "Django");

    expect(dialect.sqlToQuery(exact as never).sql).toContain('lower("packages"."name")');
    expect(dialect.sqlToQuery(order as never).sql).toBe(
      'lower("packages"."name") = $1 DESC',
    );
  });
});
