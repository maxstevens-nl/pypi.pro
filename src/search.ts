import { sql } from "drizzle-orm";
import { packages } from "./schema";
import type { Db } from "./db";

interface SearchRow {
  name: string;
  summary: string | null;
  version: string | null;
}

interface RawRow extends SearchRow {
  score?: number;
}

const selectColumns = {
  name: packages.name,
  summary: packages.summary,
  version: packages.version,
} as const;

export async function search(db: Db, q: string) {
  const raw = q.trim().toLowerCase();
  if (raw.length < 1) return { hits: [] };

  const pattern = `${raw}%`;
  const normalizedName = sql`lower(${packages.name})`;

  const prefixRows = await db
    .select({
      ...selectColumns,
    })
    .from(packages)
    .where(sql`${normalizedName} LIKE ${pattern}`)
    .orderBy(sql`${normalizedName} = ${raw} DESC`, packages.name)
    .limit(20);

  if (prefixRows.length >= 5 || raw.length < 3) {
    return { hits: prefixRows as SearchRow[] };
  }

  let fuzzyRows: unknown[];
  try {
    fuzzyRows = await db
      .select({
        ...selectColumns,
        score: sql<number>`similarity(${normalizedName}, ${raw})`,
      })
      .from(packages)
      .where(sql`${normalizedName} % ${raw}`)
      .orderBy(sql`similarity(${normalizedName}, ${raw}) DESC`, packages.name)
      .limit(20);
  } catch (error) {
    console.log(
      JSON.stringify({
        level: "warn",
        event: "fuzzy_search_unavailable",
        query: raw,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    return { hits: prefixRows as SearchRow[] };
  }

  const seen = new Set(prefixRows.map((row) => row.name));
  const hits: SearchRow[] = [
    ...(prefixRows as SearchRow[]),
    ...(fuzzyRows as RawRow[])
      .filter((row) => !seen.has(row.name))
      .map(({ score: _score, ...row }) => row),
  ].slice(0, 20);

  return { hits };
}
