import { desc, sql } from "drizzle-orm";
import { packages } from "./schema";
import type { Db } from "./db";

interface SearchRow {
  name: string;
  display_name: string | null;
  summary: string | null;
  version: string | null;
  downloads_4w: number | null;
}

interface RawRow extends SearchRow {
  exact: boolean | null;
  prefix: boolean | null;
}

const selectColumns = {
  name: packages.name,
  display_name: packages.displayName,
  summary: packages.summary,
  version: packages.version,
  downloads_4w: packages.downloads4w,
} as const;

export async function search(db: Db, q: string) {
  const raw = q.trim().toLowerCase();
  if (raw.length < 1) return { hits: [] };

  const pattern = `${raw}%`;
  const useTrigram = raw.length >= 3;

  const rows = await db
    .select({
      ...selectColumns,
      exact: sql<boolean>`${packages.name} = ${raw}`,
      prefix: sql<boolean>`${packages.name} LIKE ${pattern}`,
    })
    .from(packages)
    .where(
      sql`${packages.name} = ${raw}
          OR ${packages.name} LIKE ${pattern}
          OR (${useTrigram ? sql`true` : sql`false`} AND ${packages.name} % ${raw})`,
    )
    .orderBy(
      sql`${packages.name} = ${raw} DESC`,
      sql`${packages.name} LIKE ${pattern} DESC`,
      desc(packages.downloads4w),
    )
    .limit(20);

  const hits: SearchRow[] = (rows as RawRow[]).map(
    ({ exact: _exact, prefix: _prefix, ...rest }) => rest,
  );

  return { hits };
}
