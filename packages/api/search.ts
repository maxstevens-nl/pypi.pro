import { desc, eq, like, or, sql } from "drizzle-orm";
import { packages } from "../db/schema";
import type { Db } from "./db";

type SearchRow = {
  name: string;
  summary: string | null;
  version: string | null;
  downloads_4w: number | null;
  import_names: string[] | null;
};

const LIMIT = 20;

const searchColumns = {
  name: packages.name,
  summary: packages.summary,
  version: packages.version,
  downloads4w: packages.downloads4w,
  importNames: packages.importNames,
};

type SearchHit = {
  name: string;
  summary: string | null;
  version: string | null;
  downloads4w: number | null;
  importNames: string[] | null;
};

function normalizeQuery(q: string): string {
  return q
    .trim()
    .toLowerCase()
    .replace(/[-_.\s]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/^-+|-+$/g, "");
}

export async function search(db: Db, q: string) {
  const normalized = normalizeQuery(q);
  if (!normalized) return { hits: [] };

  const rank = sql<number>`CASE WHEN ${packages.normalizedName} = ${normalized} THEN 0 ELSE 1 END`;

  const primaryRows = await db
    .select(searchColumns)
    .from(packages)
    .where(
      or(
        eq(packages.normalizedName, normalized),
        sql`lower(${packages.name}) GLOB ${normalized + "*"}`,
      ),
    )
    .orderBy(rank, desc(packages.downloads4w), sql`length(${packages.name})`, packages.name)
    .limit(LIMIT);

  const hits = primaryRows.map(toHit);
  const seen = new Set(hits.map((row) => row.name));

  if (hits.length < LIMIT && normalized.length >= 3) {
    const underscored = normalized.replace(/-/g, "_");
    const fallbackRows = await db
      .select(searchColumns)
      .from(packages)
      .where(
        or(
          like(packages.name, `%${normalized}%`),
          like(packages.importNames, `%"${normalized}%`),
          like(packages.importNames, `%"${underscored}%`),
        ),
      )
      .orderBy(desc(packages.downloads4w))
      .limit(LIMIT * 2);
    for (const raw of fallbackRows) {
      if (hits.length >= LIMIT) break;
      if (seen.has(raw.name)) continue;
      seen.add(raw.name);
      hits.push(toHit(raw));
    }
  }

  return { hits };
}

function toHit(row: SearchHit): SearchRow {
  return {
    name: row.name,
    summary: row.summary,
    version: row.version,
    downloads_4w: row.downloads4w,
    import_names: row.importNames,
  };
}
