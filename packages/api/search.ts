import { sql } from "drizzle-orm";
import type { Db } from "./db";

type SearchRow = {
  name: string;
  summary: string | null;
  version: string | null;
  downloads_4w: number | null;
  import_names: string[] | null;
};

const LIMIT = 20;

function normalizeQuery(q: string): string {
  return q
    .trim()
    .toLowerCase()
    .replace(/[-_.\s]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/^-+|-+$/g, "");
}

function ftsPrefixExpression(term: string): string {
  const escaped = term.replace(/"/g, '""');
  return `"${escaped}"*`;
}

function ftsTrigramExpression(term: string): string {
  const escaped = term.replace(/"/g, '""');
  return `"${escaped}"`;
}

interface DbRow {
  name: string;
  summary: string | null;
  version: string | null;
  downloads_4w: number | null;
  import_names: string | null;
}

function toHit(row: unknown): SearchRow {
  const r = row as DbRow;
  let importNames: string[] | null = null;
  if (typeof r.import_names === "string") {
    try { importNames = JSON.parse(r.import_names); } catch { importNames = null; }
  }
  return {
    name: r.name,
    summary: r.summary,
    version: r.version,
    downloads_4w: r.downloads_4w,
    import_names: importNames,
  };
}

export async function search(db: Db, q: string) {
  const normalized = normalizeQuery(q);
  if (!normalized) return { hits: [] };

  const results = await db.all<DbRow>(
    sql`
      SELECT p.name, p.summary, p.version, p.downloads_4w, p.import_names
      FROM pkg_prefix fts
      JOIN packages p ON p.rowid = fts.rowid
      WHERE pkg_prefix MATCH ${ftsPrefixExpression(normalized)}
      ORDER BY rank
      LIMIT ${LIMIT}
    `,
  );

  const hits = results.map(toHit);
  const seen = new Set(hits.map((h) => h.name));

  if (hits.length < LIMIT) {
    const fallback = await db.all<DbRow>(
      sql`
        SELECT p.name, p.summary, p.version, p.downloads_4w, p.import_names
        FROM pkg_trigram fts
        JOIN packages p ON p.rowid = fts.rowid
        WHERE pkg_trigram MATCH ${ftsTrigramExpression(normalized)}
        ORDER BY rank
        LIMIT ${LIMIT}
      `,
    );

    for (const row of fallback) {
      if (hits.length >= LIMIT) break;
      const hit = toHit(row);
      if (seen.has(hit.name)) continue;
      seen.add(hit.name);
      hits.push(hit);
    }
  }

  return { hits };
}
