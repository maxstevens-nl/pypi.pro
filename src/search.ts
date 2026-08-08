import { sql } from "drizzle-orm";
import type { Db } from "./db";

type SearchRow = {
  name: string;
  summary: string | null;
  version: string | null;
  downloads_4w: number | string | null;
};

export async function search(db: Db, q: string) {
  const raw = q.trim().toLowerCase();
  if (raw.length < 1) return { hits: [] };

  const bm25Score = sql`search_tsv <@> to_bm25query(to_tsvector('simple', ${raw}), 'idx_packages_search_bm25')`;

  const result = await db.execute(sql`
    WITH candidates AS (
      SELECT name, summary, version, downloads_4w, ${bm25Score} AS score
      FROM packages
      WHERE ${bm25Score} < 0
      ORDER BY ${bm25Score}
      LIMIT 100
    )
    SELECT name, summary, version, downloads_4w
    FROM candidates
    ORDER BY
      (lower(unaccent(name)) = lower(unaccent(${raw}))) DESC,
      downloads_4w DESC NULLS LAST,
      score
    LIMIT 20
  `);

  const rows: SearchRow[] = extractRows(result);

  return { hits: rows };
}

function extractRows(result: unknown): SearchRow[] {
  if (Array.isArray(result)) return result as SearchRow[];
  if (result && typeof result === "object" && "rows" in result) {
    return (result as { rows: SearchRow[] }).rows;
  }
  return [];
}
