import { spawnSync } from "node:child_process";
import { openSync, readFileSync, writeFileSync, closeSync, statSync } from "node:fs";
import type { PackageRecord } from "../src/types";

const DATABASE_URL = process.env.DATABASE_URL;
const SNAPSHOT_PATH = process.env.SNAPSHOT_PATH ?? "snapshot.ndjson";

async function main() {
  if (!DATABASE_URL) {
    console.error("DATABASE_URL is not set. Copy .env.example to .env (local default works).");
    process.exit(1);
  }

  const proxyHost = new URL(DATABASE_URL).hostname;
  if (proxyHost !== "db.localtest.me") {
    console.error(`DATABASE_URL host is "${proxyHost}", expected "db.localtest.me".`);
    console.error("This script only seeds the local dev Postgres started by `sst dev`.");
    process.exit(1);
  }

  const count = spawnSync(
    "psql",
    [DATABASE_URL, "-t", "-A", "-c", "SELECT count(*) FROM packages"],
    {
      encoding: "utf8",
    },
  );
  if (count.status === 0 && parseInt((count.stdout ?? "").trim(), 10) > 0) {
    console.log(`Seed skipped: packages table already has ${count.stdout.trim()} rows.`);
    return;
  }

  console.log(`Reading ${SNAPSHOT_PATH}...`);
  const raw = readFileSync(SNAPSHOT_PATH, "utf8");
  const lines = raw.split("\n").filter((l) => l.trim().length > 0);
  console.log(`Loaded ${lines.length} records from snapshot.`);

  const records: PackageRecord[] = [];
  for (const line of lines) {
    try {
      records.push(JSON.parse(line) as PackageRecord);
    } catch {
      console.warn(`Skipping malformed line: ${line.slice(0, 80)}...`);
    }
  }
  if (records.length === 0) {
    console.error(
      `No records found in ${SNAPSHOT_PATH}. Run \`bun scripts/build-snapshot.ts\` first.`,
    );
    process.exit(1);
  }

  console.log("Schema bootstrap...");
  const schemaR = spawnSync("psql", [DATABASE_URL, "-v", "ON_ERROR_STOP=1", "-f", "schema.sql"], {
    stdio: "inherit",
  });
  if (schemaR.status !== 0) {
    console.error("schema.sql failed");
    process.exit(schemaR.status ?? 1);
  }

  console.log("Materializing CSV for COPY...");
  writeFileSync("seed.csv", "");
  const out = openSync("seed.csv", "a");
  const escapeCsv = (s: string | null | undefined): string => {
    if (s == null) return "\\N";
    if (/[",\n\r\\]/.test(s)) return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '""')}"`;
    return s;
  };
  for (const r of records) {
    const row = [
      escapeCsv(r.name),
      escapeCsv(r.display_name),
      escapeCsv(r.summary),
      escapeCsv(r.version),
      escapeCsv(r.home_page),
      String(Math.floor(r.updated_at ?? 0)),
      String(r.downloads_1w ?? 0),
      String(r.downloads_4w ?? 0),
      String(r.trend ?? 0),
    ].join(",");
    writeFileSync(out, row + "\n");
  }
  closeSync(out);
  console.log(`Wrote seed.csv (${statSync("seed.csv").size} bytes, ${records.length} rows).`);

  const sql = [
    "BEGIN;",
    "TRUNCATE TABLE packages;",
    "\\copy packages (name, display_name, summary, version, home_page, updated_at, downloads_1w, downloads_4w, trend) FROM 'seed.csv' WITH (FORMAT csv, NULL '\\N')",
    "COMMIT;",
    "VACUUM (ANALYZE) packages;",
    "SELECT count(*) AS seeded, count(summary) AS with_summary, count(display_name) AS with_display_name FROM packages;",
    "",
  ].join("\n");

  const r = spawnSync("psql", [DATABASE_URL, "-v", "ON_ERROR_STOP=1"], {
    stdio: ["pipe", "inherit", "inherit"],
    input: sql,
  });
  if (r.status !== 0) {
    console.error("psql import failed");
    process.exit(r.status ?? 1);
  }

  console.log("Seed complete.");
  writeFileSync("seed.csv", "");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
