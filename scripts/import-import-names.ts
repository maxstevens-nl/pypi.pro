// Import import-name detection results from CSV into the packages table.
// Reads .data/import-names.csv (written by detect-import-name-snapshot.ts),
// matches rows to packages by normalized display_name, and sets the
// import_names column.
//
// Requires a running SST session (or DATABASE_URL) and that the migration
// adding packages.import_names has been applied.
//
// Usage:
//   bun scripts/import-import-names.ts
//   bun scripts/import-import-names.ts --csv=.data/import-names.csv
//
// After a bulk import, run `VACUUM packages` so the BM25 corpus statistics
// stay accurate (see AGENTS.md).

import { Resource } from "sst";
import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL ?? Resource.NeonDatabase.connectionString;
const csvArg = Bun.argv.find((a) => a.startsWith("--csv="));
const CSV_PATH = csvArg ? csvArg.split("=")[1] : ".data/import-names.csv";

function normalize(name: string): string {
  return name.toLowerCase().replace(/[-_.]+/g, "-");
}

function csvField(v: string): string {
  const t = v.trim();
  if (t.startsWith('"') && t.endsWith('"')) return t.slice(1, -1).replace(/""/g, '"');
  return t;
}

function pgArrayLiteral(values: string[]): string {
  return `{${values
    .map((v) => `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`)
    .join(",")}}`;
}

async function main() {
  const text = await Bun.file(CSV_PATH).text();
  const lines = text.split("\n").filter(Boolean);
  if (lines.length === 0) throw new Error(`${CSV_PATH} is empty`);

  const names: string[] = [];
  const literals: string[] = [];
  let skipped = 0;

  for (const line of lines.slice(1)) {
    const fields = line.split(",");
    const displayName = csvField(fields[0] ?? "");
    const importNamesField = csvField(fields[4] ?? "");
    const error = fields.slice(5).join(",").trim();
    if (!displayName || !importNamesField) {
      skipped++;
      continue;
    }
    if (error) {
      skipped++;
      continue;
    }
    const importNames = importNamesField.split("|").filter(Boolean);
    names.push(normalize(displayName));
    literals.push(pgArrayLiteral(importNames));
  }

  if (names.length === 0) {
    console.log(`No rows to import (${skipped} skipped).`);
    return;
  }

  console.log(`Importing import_names for ${names.length} packages (${skipped} skipped)...`);

  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    const result = await client.query(
      `UPDATE packages
       SET import_names = x.import_names
       FROM (SELECT unnest($1::text[]) AS normalized_name, unnest($2::text[])::text[] AS import_names) x
       WHERE packages.normalized_name = x.normalized_name`,
      [names, literals],
    );
    console.log(`Updated ${result.rowCount} rows.`);
    console.log("Tip: run `VACUUM packages` so BM25 corpus statistics are refreshed.");
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("Import failed:", error);
  process.exit(1);
});
