export interface SearchRow {
  name: string;
  display_name: string | null;
  summary: string | null;
  version: string | null;
  downloads_4w: number | null;
}

export async function search(db: import("./db").Db, q: string) {
  const raw = q.trim().toLowerCase();
  if (raw.length < 1) return { hits: [] };

  const exact = await findExactMatch(db, raw);
  let rows = await runPrefix(db, raw);

  if (rows.length < 5 && raw.length >= 3) {
    const seen = new Set(rows.map((r) => r.name));
    const trigramRows = await runTrigram(db, raw);
    for (const r of trigramRows) {
      if (!seen.has(r.name)) rows.push(r);
    }
  }

  if (exact && rows[0]?.name !== raw) {
    rows = rows.filter((r) => r.name !== raw);
    rows.unshift(exact);
  }

  return { hits: rows.slice(0, 20) };
}

async function findExactMatch(db: import("./db").Db, q: string): Promise<SearchRow | null> {
  const { rows } = await db.query(
    `SELECT name, display_name, summary, version, downloads_4w
     FROM packages
     WHERE name = $1`,
    [q]
  );
  return (rows[0] as SearchRow | undefined) ?? null;
}

async function runPrefix(db: import("./db").Db, q: string): Promise<SearchRow[]> {
  const { rows } = await db.query(
    `SELECT name, display_name, summary, version, downloads_4w
     FROM packages
     WHERE name LIKE $1 || '%'
     ORDER BY downloads_4w DESC
     LIMIT 20`,
    [q]
  );
  return rows as SearchRow[];
}

async function runTrigram(db: import("./db").Db, q: string): Promise<SearchRow[]> {
  const { rows } = await db.query(
    `SELECT name, display_name, summary, version, downloads_4w
     FROM packages
     WHERE name % $1
     ORDER BY similarity(name, $1) DESC, downloads_4w DESC
     LIMIT 20`,
    [q]
  );
  return rows as SearchRow[];
}

export async function ingest(db: import("./db").Db, records: any[]) {
  const client = await db.connect();
  try {
    for (const r of records) {
      await client.query(
        `INSERT INTO packages (name, display_name, summary, version, home_page,
                               updated_at, downloads_1w, downloads_4w, trend, downloads_52w)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (name) DO UPDATE SET
           display_name = EXCLUDED.display_name,
           summary      = EXCLUDED.summary,
           version      = EXCLUDED.version,
           home_page    = EXCLUDED.home_page,
           updated_at   = EXCLUDED.updated_at,
           downloads_1w = EXCLUDED.downloads_1w,
           downloads_4w = EXCLUDED.downloads_4w,
           trend        = EXCLUDED.trend,
           downloads_52w = EXCLUDED.downloads_52w`,
        [
          r.name,
          r.display_name ?? null,
          r.summary ?? "",
          r.version ?? "",
          r.home_page ?? null,
          r.updated_at ?? 0,
          r.downloads_1w ?? 0,
          r.downloads_4w ?? 0,
          r.trend ?? 0,
          r.downloads_52w ?? null,
        ]
      );
    }
  } finally {
    client.release();
  }

  return { ok: true, count: records.length };
}

export async function health(db: import("./db").Db) {
  const { rows } = await db.query("SELECT COUNT(*)::int AS count FROM packages");
  return { count: rows[0]?.count ?? 0 };
}