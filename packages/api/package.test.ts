import { describe, expect, test } from "bun:test";
import { PgDialect } from "drizzle-orm/pg-core";
import { getPackage } from "./package";
import type { Db } from "./db";

describe("getPackage", () => {
  const dialect = new PgDialect();

  test("returns the package row mapped to camelCase", async () => {
    const row = {
      name: "django",
      summary: "A web framework",
      description: "Long description",
      author: "Django Software Foundation",
      license: "BSD-3-Clause",
      classifiers: ["Framework :: Django"],
      requiresPython: ">=3.10",
      keywords: "web, framework",
      version: "5.0.6",
      homePage: "https://djangoproject.com",
      updatedAt: 1710000000,
      downloads4w: 123456,
      importNames: ["django"],
    };
    const db = {
      execute() {
        return Promise.resolve([row]);
      },
    } as unknown as Db;

    const result = await getPackage(db, "django");
    expect(result).toEqual(row);
  });

  test("returns null when no row matches", async () => {
    const db = {
      execute() {
        return Promise.resolve([]);
      },
    } as unknown as Db;

    const result = await getPackage(db, "does-not-exist");
    expect(result).toBeNull();
  });

  test("matches case-insensitively on the name", async () => {
    const params: unknown[] = [];
    const db = {
      execute(query: unknown) {
        params.push(query);
        return Promise.resolve([]);
      },
    } as unknown as Db;

    await getPackage(db, "DJANGO");
    const { sql: rendered, params: values } = dialect.sqlToQuery(params[0] as never);
    expect(rendered).toContain("lower(name)");
    expect(rendered).toContain("LIMIT 1");
    expect(values).toContain("DJANGO");
  });
});
