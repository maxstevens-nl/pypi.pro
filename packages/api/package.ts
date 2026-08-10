import { sql } from "drizzle-orm";
import type { Db } from "./db";
import { packages } from "./schema";

export async function getPackage(db: Db, name: string): Promise<Package | null> {
  const row = await db.query.packages.findOne({
    where: { name },
    select: {
      name: true,
      summary: true,
      description: true,
      author: true,
      license: true,
      classifiers: true,
      requiresPython: true,
      keywords: true,
      version: true,
      homePage: true,
      updatedAt: true,
      downloads4w: true,
      importNames: true,
    },
  });
  // const row = await db.get<Package>(sql`
  //   SELECT
  //     name,
  //     summary,
  //     description,
  //     author,
  //     license,
  //     classifiers,
  //     requires_python AS "requiresPython",
  //     keywords,
  //     version,
  //     home_page AS "homePage",
  //     updated_at AS "updatedAt",
  //     downloads_4w AS "downloads4w",
  //     import_names AS "importNames"
  //   FROM packages
  //   WHERE lower(name) = lower(${name})
  //   LIMIT 1
  // `);

  if (!row) return null;
  return {
    ...row,
    classifiers: parseJsonArray(row.classifiers),
    importNames: parseJsonArray(row.importNames),
  };
}

function parseJsonArray(value: string | string[] | null): string[] | null {
  if (value === null || Array.isArray(value)) return value;
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as string[]) : null;
  } catch {
    return null;
  }
}
