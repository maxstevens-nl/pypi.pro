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
  const normalized = raw.replace(/[-_.]+/g, "-");

  const bm25Score = sql`search_tsv <@> to_bm25query(to_tsvector('simple', ${normalized}), 'idx_packages_search_bm25')`;

  const result = await db.execute(sql`
    WITH bm25 AS (
      SELECT name, summary, version, downloads_4w, normalized_name, ${bm25Score} AS score
      FROM packages
      WHERE ${bm25Score} < 0
      ORDER BY ${bm25Score}
      LIMIT 100
    ),
    exact AS (
      SELECT name, summary, version, downloads_4w, normalized_name, 0::double precision AS score
      FROM packages
      WHERE normalized_name = ${normalized}
      LIMIT 1
    ),
    candidates AS (
      SELECT name, summary, version, downloads_4w, normalized_name, score,
        ROW_NUMBER() OVER (
          PARTITION BY name
          ORDER BY (normalized_name = ${normalized}) DESC, score
        ) AS rn
      FROM (
        SELECT * FROM bm25
        UNION ALL
        SELECT * FROM exact
      ) all_candidates
    )
    SELECT name, summary, version, downloads_4w
    FROM candidates
    WHERE rn = 1
    ORDER BY
      (normalized_name = ${normalized}) DESC,
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
