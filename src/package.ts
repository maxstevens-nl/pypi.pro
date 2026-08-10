import { sql } from "drizzle-orm";
import type { Db } from "./db";

export type PackageDetail = {
  name: string;
  summary: string | null;
  description: string | null;
  author: string | null;
  license: string | null;
  classifiers: string[] | null;
  requiresPython: string | null;
  keywords: string | null;
  version: string | null;
  homePage: string | null;
  updatedAt: number | null;
  downloads4w: number | string | null;
  importNames: string[] | null;
};

export async function getPackage(db: Db, name: string): Promise<PackageDetail | null> {
  const result = await db.execute(sql`
    SELECT
      name,
      summary,
      description,
      author,
      license,
      classifiers,
      requires_python AS "requiresPython",
      keywords,
      version,
      home_page AS "homePage",
      updated_at AS "updatedAt",
      downloads_4w AS "downloads4w",
      import_names AS "importNames"
    FROM packages
    WHERE lower(name) = lower(${name})
    LIMIT 1
  `);

  const rows = extractRows(result);
  return (rows[0] as PackageDetail) ?? null;
}

function extractRows(result: unknown): unknown[] {
  if (Array.isArray(result)) return result;
  if (result && typeof result === "object" && "rows" in result) {
    return (result as { rows: unknown[] }).rows;
  }
  return [];
}
