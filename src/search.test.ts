import { describe, expect, test } from "bun:test";
import { PgDialect } from "drizzle-orm/pg-core";
import { search } from "./search";
import type { Db } from "./db";

describe("search", () => {
  test("matches and ranks package names case-insensitively", async () => {
    const dialect = new PgDialect();
    let order: unknown;

    const db = {
      select(_selection: Record<string, unknown>) {
        return {
          from() {
            return {
              where() {
                return {
                  orderBy(...expressions: unknown[]) {
                    order = expressions[0];
                    return {
                      limit: async () =>
                        Array.from({ length: 5 }, (_, index) => ({
                          name: index === 0 ? "Django" : `Django-${index}`,
                        })),
                    };
                  },
                };
              },
            };
          },
        };
      },
    } as unknown as Db;

    await search(db, "Django");

    expect(dialect.sqlToQuery(order as never).sql).toBe(
      'lower("packages"."name") = $1 DESC',
    );
  });
});
