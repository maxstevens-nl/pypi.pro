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
  downloads_4w?: number;
  updated_at: number;
};

export function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[-_.]+/g, "-");
}

const BATCH_SIZE = 500;

const UPSERT_SQL = `
  INSERT INTO packages (
    name, version, summary, description, author, license, classifiers,
    requires_python, keywords, home_page, updated_at, downloads_4w, normalized_name
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT (name) DO UPDATE SET
    version = excluded.version,
    summary = excluded.summary,
    description = excluded.description,
    author = excluded.author,
    license = excluded.license,
    classifiers = excluded.classifiers,
    requires_python = excluded.requires_python,
    keywords = excluded.keywords,
    home_page = excluded.home_page,
    updated_at = excluded.updated_at,
    downloads_4w = CASE
      WHEN excluded.downloads_4w > 0 THEN excluded.downloads_4w
      ELSE packages.downloads_4w
    END,
    normalized_name = excluded.normalized_name
`;

export async function upsertPackages(
  db: D1Database,
  rows: readonly PackageMetadata[],
): Promise<void> {
  if (rows.length === 0) return;

  const stmt = db.prepare(UPSERT_SQL);
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    await db.batch(chunk.map((row) => stmt.bind(...toParams(row))));
  }
}

function toParams(row: PackageMetadata): (string | number | null)[] {
  return [
    row.name,
    row.version,
    row.summary,
    row.description,
    row.author,
    row.license,
    row.classifiers ? JSON.stringify(row.classifiers) : null,
    row.requires_python,
    row.keywords,
    row.home_page,
    Number(row.updated_at),
    row.downloads_4w ?? null,
    normalizeName(row.name),
  ];
}
