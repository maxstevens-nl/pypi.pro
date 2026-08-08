import { sql } from "drizzle-orm";
import type { Db } from "./db";
import { buildSearchQuery } from "./query";

type SearchRow = {
  name: string;
  summary: string | null;
  version: string | null;
};

export async function search(db: Db, q: string) {
  const raw = q.trim().toLowerCase();
  if (raw.length < 1) return { hits: [] };

  const { prefixPattern, needsTrgm, needsFts, tsQueryParam } = buildSearchQuery(raw);

  const result = await db.execute(sql`
    WITH
    prefix AS (
      SELECT name, summary, version, downloads_4w, 1 AS tier, 1.0::real AS lex
      FROM packages
      WHERE lower(name) LIKE ${prefixPattern}
      ORDER BY (lower(name) = ${raw}) DESC, downloads_4w DESC NULLS LAST, name
      LIMIT 10
    ),
    fuzzy AS (
      SELECT name, summary, version, downloads_4w, 2 AS tier, similarity(lower(name), ${raw}) AS lex
      FROM packages
      WHERE lower(name) % ${raw} AND ${needsTrgm}
      ORDER BY lower(name) <-> ${raw}
      LIMIT 10
    ),
    fts AS (
      SELECT name, summary, version, downloads_4w, 3 AS tier,
             (ts_rank(search_tsv, to_tsquery('simple', ${tsQueryParam}), 32)
              + ts_rank(search_tsv, to_tsquery('english', ${tsQueryParam}), 32)) AS lex
      FROM packages
      WHERE search_tsv @@ (to_tsquery('simple', ${tsQueryParam}) || to_tsquery('english', ${tsQueryParam}))
        AND ${needsFts}
      ORDER BY (ts_rank(search_tsv, to_tsquery('simple', ${tsQueryParam}), 32)
                + ts_rank(search_tsv, to_tsquery('english', ${tsQueryParam}), 32)) DESC
      LIMIT 10
    ),
    union_all AS (
      SELECT * FROM prefix
      UNION ALL
      SELECT * FROM fuzzy
      UNION ALL
      SELECT * FROM fts
    ),
    dedup AS (
      SELECT DISTINCT ON (name) *
      FROM union_all
      ORDER BY name, tier, lex DESC
    )
    SELECT name, summary, version
    FROM dedup
    ORDER BY tier, lex DESC, ln(coalesce(downloads_4w, 0) + 1) DESC, name
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
