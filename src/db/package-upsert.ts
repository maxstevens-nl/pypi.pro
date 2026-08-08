import type { Client } from "pg";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { from as copyFrom } from "pg-copy-streams";

export type PackageMetadata = {
  name: string;
  version: string | null;
  summary: string | null;
  description: string | null;
  author: string | null;
  license: string | null;
  classifiers: string[] | null;
  requires_python: string | null;
  keywords: string | null;
  home_page: string | null;
  updated_at: number;
};

const columns =
  "name, version, summary, description, author, license, classifiers, requires_python, keywords, home_page, updated_at";

function csvField(value: string | number | null): string {
  if (value === null) return "\\N";
  return `"${String(value).replaceAll('"', '""')}"`;
}

function postgresArray(values: string[] | null): string | null {
  if (values === null) return null;
  return `{${values
    .map((value) => `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`)
    .join(",")}}`;
}

function csvRow(row: PackageMetadata): string {
  return [
    row.name,
    row.version,
    row.summary,
    row.description,
    row.author,
    row.license,
    postgresArray(row.classifiers),
    row.requires_python,
    row.keywords,
    row.home_page,
    row.updated_at,
  ]
    .map(csvField)
    .join(",");
}

export async function copyUpsertPackages(
  client: Client,
  rows: readonly PackageMetadata[],
): Promise<void> {
  if (rows.length === 0) return;

  await client.query("BEGIN");
  try {
    await client.query(
      `CREATE TEMP TABLE seed_packages (LIKE packages INCLUDING DEFAULTS) ON COMMIT DROP`,
    );
    const copy = client.query(
      copyFrom(`COPY seed_packages (${columns}) FROM STDIN WITH (FORMAT csv, NULL '\\N')`),
    );
    await pipeline(Readable.from(rows.map((row) => `${csvRow(row)}\n`)), copy);
    await client.query(
      `INSERT INTO packages (${columns})
       SELECT ${columns} FROM seed_packages
       ON CONFLICT (name) DO UPDATE SET
         version = EXCLUDED.version,
         summary = EXCLUDED.summary,
         description = EXCLUDED.description,
         author = EXCLUDED.author,
         license = EXCLUDED.license,
         classifiers = EXCLUDED.classifiers,
         requires_python = EXCLUDED.requires_python,
         keywords = EXCLUDED.keywords,
         home_page = EXCLUDED.home_page,
         updated_at = EXCLUDED.updated_at`,
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

export async function upsertPackages(
  client: Client,
  rows: readonly PackageMetadata[],
): Promise<void> {
  if (rows.length === 0) return;

  const values: unknown[] = [];
  const placeholders = rows.map((row, rowIndex) => {
    const offset = rowIndex * 11;
    values.push(
      row.name,
      row.version,
      row.summary,
      row.description,
      row.author,
      row.license,
      row.classifiers,
      row.requires_python,
      row.keywords,
      row.home_page,
      row.updated_at,
    );
    return `(${Array.from({ length: 11 }, (_, columnIndex) => `$${offset + columnIndex + 1}`).join(",")})`;
  });

  await client.query("BEGIN");
  try {
    await client.query(
      `INSERT INTO packages
          (name, version, summary, description, author, license,
           classifiers, requires_python, keywords, home_page, updated_at)
         VALUES ${placeholders.join(",")}
         ON CONFLICT (name) DO UPDATE SET
           version = EXCLUDED.version,
           summary = EXCLUDED.summary,
           description = EXCLUDED.description,
           author = EXCLUDED.author,
           license = EXCLUDED.license,
           classifiers = EXCLUDED.classifiers,
           requires_python = EXCLUDED.requires_python,
           keywords = EXCLUDED.keywords,
           home_page = EXCLUDED.home_page,
           updated_at = EXCLUDED.updated_at`,
      values,
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
