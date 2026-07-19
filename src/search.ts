import { sanitizeFtsTerm } from "./query";

export async function search(db: D1Database, q: string) {
  const raw = q.trim().toLowerCase();
  if (raw.length < 1) return { hits: [] };

  const exact = await findExactMatch(db, raw);
  let rows = await runPrefix(db, raw);

  if (rows.length < 5 && raw.length >= 3) {
    const seen = new Set(rows.map((r: any) => r.name));
    const trigramRows = await runTrigram(db, raw);
    for (const r of trigramRows) {
      if (!seen.has(r.name)) rows.push(r);
    }
  }

  if (exact && rows[0]?.name !== raw) {
    rows = rows.filter((r: any) => r.name !== raw);
    rows.unshift(exact);
  }

  return { hits: rows.slice(0, 20) };
}

async function findExactMatch(db: D1Database, q: string) {
  const result = await db.prepare(`
    SELECT name, display_name, summary, version, downloads_4w
    FROM packages
    WHERE name = ?
  `).bind(q).first();
  return result;
}

async function runPrefix(db: D1Database, q: string) {
  const term = `name:${sanitizeFtsTerm(q)}*`;
  const ftsResults = await db.prepare(`
    SELECT rowid FROM pkg_prefix WHERE pkg_prefix MATCH ? LIMIT 100
  `).bind(term).all();

  if (ftsResults.results.length === 0) return [];

  const rowids = ftsResults.results.map((r: any) => r.rowid).join(',');
  const results = await db.prepare(`
    SELECT name, display_name, summary, version, downloads_4w
    FROM packages
    WHERE rowid IN (${rowids})
    ORDER BY downloads_4w DESC
  `).all();

  return results.results.slice(0, 20);
}

async function runTrigram(db: D1Database, q: string) {
  const term = `name:${sanitizeFtsTerm(q)}`;
  const ftsResults = await db.prepare(`
    SELECT rowid FROM pkg_trigram WHERE pkg_trigram MATCH ? LIMIT 100
  `).bind(term).all();

  if (ftsResults.results.length === 0) return [];

  const rowids = ftsResults.results.map((r: any) => r.rowid).join(',');
  const results = await db.prepare(`
    SELECT name, display_name, summary, version, downloads_4w
    FROM packages
    WHERE rowid IN (${rowids})
    ORDER BY downloads_4w DESC
  `).all();

  return results.results.slice(0, 20);
}

export async function ingest(db: D1Database, records: any[]) {
  const stmt = db.prepare(`
    INSERT INTO packages (name, display_name, summary, version, home_page,
                          updated_at, downloads_1w, downloads_4w, trend, downloads_52w)
    VALUES (?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(name) DO UPDATE SET
      display_name=excluded.display_name, summary=excluded.summary,
      version=excluded.version, home_page=excluded.home_page,
      updated_at=excluded.updated_at, downloads_1w=excluded.downloads_1w,
      downloads_4w=excluded.downloads_4w, trend=excluded.trend,
      downloads_52w=excluded.downloads_52w
  `);

  const ftsStmt = db.prepare(`
    INSERT OR REPLACE INTO pkg_prefix(rowid, name, summary)
    SELECT rowid, name, summary FROM packages WHERE name = ?
  `);

  const ftsTrigramStmt = db.prepare(`
    INSERT OR REPLACE INTO pkg_trigram(rowid, name, summary)
    SELECT rowid, name, summary FROM packages WHERE name = ?
  `);

  for (const r of records) {
    const blob = r.downloads_52w ? packUint32LE(r.downloads_52w) : null;
    await stmt.bind(
      r.name, r.display_name, r.summary ?? "", r.version ?? "", r.home_page ?? "",
      r.updated_at ?? 0, r.downloads_1w ?? 0, r.downloads_4w ?? 0, r.trend ?? 0, blob
    ).run();

    await ftsStmt.bind(r.name).run();
    await ftsTrigramStmt.bind(r.name).run();
  }

  return { ok: true, count: records.length };
}

function packUint32LE(nums: number[]): ArrayBuffer {
  const buf = new ArrayBuffer(52 * 4);
  const view = new DataView(buf);
  for (let i = 0; i < Math.min(nums.length, 52); i++) {
    view.setUint32(i * 4, nums[i], true);
  }
  return buf;
}

export async function health(db: D1Database) {
  const result = await db.prepare("SELECT COUNT(*) as count FROM packages").first();
  return { count: (result as any).count };
}
