import { DurableObject } from "cloudflare:workers";
import { sanitizeFtsTerm } from "./query";
import type { PackageRecord } from "./types";

const SCHEMA_DDL = `
CREATE TABLE IF NOT EXISTS packages (
  name           TEXT PRIMARY KEY,
  display_name   TEXT,
  summary        TEXT,
  version        TEXT,
  home_page      TEXT,
  updated_at     INTEGER,
  downloads_1w   INTEGER DEFAULT 0,
  downloads_4w   INTEGER DEFAULT 0,
  trend          REAL   DEFAULT 0,
  downloads_52w  BLOB
);

CREATE VIRTUAL TABLE IF NOT EXISTS pkg_prefix USING fts5(
  name, summary,
  content='packages', content_rowid='rowid',
  prefix='2 3 4'
);

CREATE VIRTUAL TABLE IF NOT EXISTS pkg_trigram USING fts5(
  name, summary,
  content='packages', content_rowid='rowid',
  tokenize='trigram'
);

CREATE TRIGGER IF NOT EXISTS packages_ai AFTER INSERT ON packages BEGIN
  INSERT INTO pkg_prefix(rowid, name, summary) VALUES (new.rowid, new.name, new.summary);
  INSERT INTO pkg_trigram(rowid, name, summary) VALUES (new.rowid, new.name, new.summary);
END;

CREATE TRIGGER IF NOT EXISTS packages_ad AFTER DELETE ON packages BEGIN
  INSERT INTO pkg_prefix(pkg_prefix, rowid, name, summary) VALUES('delete', old.rowid, old.name, old.summary);
  INSERT INTO pkg_trigram(pkg_trigram, rowid, name, summary) VALUES('delete', old.rowid, old.name, old.summary);
END;

CREATE TRIGGER IF NOT EXISTS packages_au AFTER UPDATE OF name, summary ON packages BEGIN
  INSERT INTO pkg_prefix(pkg_prefix, rowid, name, summary) VALUES('delete', old.rowid, old.name, old.summary);
  INSERT INTO pkg_trigram(pkg_trigram, rowid, name, summary) VALUES('delete', old.rowid, old.name, old.summary);
  INSERT INTO pkg_prefix(rowid, name, summary) VALUES (new.rowid, new.name, new.summary);
  INSERT INTO pkg_trigram(rowid, name, summary) VALUES (new.rowid, new.name, new.summary);
END;
`;

function packUint32LE(nums: number[]): ArrayBuffer {
  const buf = new ArrayBuffer(52 * 4);
  const view = new DataView(buf);
  for (let i = 0; i < Math.min(nums.length, 52); i++) {
    view.setUint32(i * 4, nums[i], true);
  }
  return buf;
}

export class SearchIndex extends DurableObject {
  sql = this.ctx.storage.sql;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.sql.exec(SCHEMA_DDL);
    });
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    switch (url.pathname) {
      case "/search":
        return this.handleSearch(url);
      case "/ingest":
        return this.handleIngest(req);
      case "/bootstrap":
        return this.handleBootstrap(req);
      case "/health":
        return this.handleHealth();
      default:
        return new Response("not found", { status: 404 });
    }
  }

  private handleHealth(): Response {
    const result = this.sql.exec("SELECT COUNT(*) as count FROM packages").toArray()[0];
    return Response.json({ count: (result as any).count });
  }

  private handleSearch(url: URL): Response {
    const raw = (url.searchParams.get("q") ?? "").trim().toLowerCase();
    if (raw.length < 1) return Response.json({ hits: [] });

    const exact = this.findExactMatch(raw);
    let rows = this.runPrefix(raw);

    if (rows.length < 5 && raw.length >= 3) {
      const seen = new Set(rows.map((r: any) => r.name));
      for (const r of this.runTrigram(raw)) {
        if (!seen.has(r.name)) rows.push(r);
      }
    }

    if (exact && rows[0]?.name !== raw) {
      rows = rows.filter((r: any) => r.name !== raw);
      rows.unshift(exact);
    }

    return Response.json({ hits: rows.slice(0, 20) });
  }

  private findExactMatch(q: string) {
    return this.sql.exec(`
      SELECT name, display_name, summary, version, downloads_4w
      FROM packages
      WHERE name = ?
    `, q).toArray()[0];
  }

  private runPrefix(q: string) {
    const term = `name:${sanitizeFtsTerm(q)}*`;
    const ftsRows = this.sql.exec(`
      SELECT rowid FROM pkg_prefix WHERE pkg_prefix MATCH ? LIMIT 100
    `, term).toArray();
    
    if (ftsRows.length === 0) return [];
    
    const rowids = ftsRows.map((r: any) => r.rowid).join(',');
    const rows = this.sql.exec(`
      SELECT name, display_name, summary, version, downloads_4w
      FROM packages
      WHERE rowid IN (${rowids})
      ORDER BY downloads_4w DESC
    `).toArray();
    
    return rows.slice(0, 20);
  }

  private runTrigram(q: string) {
    const term = `name:${sanitizeFtsTerm(q)}`;
    const ftsRows = this.sql.exec(`
      SELECT rowid FROM pkg_trigram WHERE pkg_trigram MATCH ? LIMIT 100
    `, term).toArray();
    
    if (ftsRows.length === 0) return [];
    
    const rowids = ftsRows.map((r: any) => r.rowid).join(',');
    const rows = this.sql.exec(`
      SELECT name, display_name, summary, version, downloads_4w
      FROM packages
      WHERE rowid IN (${rowids})
      ORDER BY downloads_4w DESC
    `).toArray();
    
    return rows.slice(0, 20);
  }

  private async handleIngest(req: Request): Promise<Response> {
    const { records } = await req.json<{ records: PackageRecord[] }>();
    for (let i = 0; i < records.length; i += 5000) {
      const chunk = records.slice(i, i + 5000);
      this.ctx.storage.transactionSync(() => {
        for (const r of chunk) this.upsert(r);
      });
    }
    return Response.json({ ok: true, count: records.length });
  }

  private upsert(r: PackageRecord) {
    const blob = r.downloads_52w ? packUint32LE(r.downloads_52w) : null;
    this.sql.exec(`
      INSERT INTO packages (name, display_name, summary, version, home_page,
                            updated_at, downloads_1w, downloads_4w, trend, downloads_52w)
      VALUES (?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(name) DO UPDATE SET
        display_name=excluded.display_name, summary=excluded.summary,
        version=excluded.version, home_page=excluded.home_page,
        updated_at=excluded.updated_at, downloads_1w=excluded.downloads_1w,
        downloads_4w=excluded.downloads_4w, trend=excluded.trend,
        downloads_52w=excluded.downloads_52w
    `, r.name, r.display_name, r.summary ?? "", r.version ?? "", r.home_page ?? "",
       r.updated_at ?? 0, r.downloads_1w ?? 0, r.downloads_4w ?? 0, r.trend ?? 0, blob);
  }

  private async handleBootstrap(req: Request): Promise<Response> {
    const { bucket } = await req.json<{ bucket: string }>();
    const object = await this.env.SNAPSHOTS.get(bucket);
    if (!object) return new Response("snapshot not found", { status: 404 });

    const body = await object.text();
    const lines = body.split("\n").filter(l => l.trim());
    const records: PackageRecord[] = [];

    for (const line of lines) {
      try {
        records.push(JSON.parse(line));
      } catch {}
    }

    for (let i = 0; i < records.length; i += 5000) {
      const chunk = records.slice(i, i + 5000);
      this.ctx.storage.transactionSync(() => {
        for (const r of chunk) this.upsert(r);
      });
    }

    return Response.json({ ok: true, count: records.length });
  }
}
