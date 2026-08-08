import { Resource } from "sst";
import pg from "pg";

const DATABASE_URL = Resource.NeonDatabase.connectionString;

async function main() {
  if (!DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
  }

  console.log("Fetching hugovk top-pypi-packages 30-day download counts...");
  const res = await fetch(
    "https://raw.githubusercontent.com/hugovk/top-pypi-packages/main/top-pypi-packages-30-days.min.json",
  );
  const data = (await res.json()) as { rows: { project: string; download_count: number }[] };
  console.log(`Fetched ${data.rows.length} packages with download counts`);

  const names: string[] = [];
  const counts: bigint[] = [];

  for (const row of data.rows) {
    const name = row.project.toLowerCase().replace(/[-_.]+/g, "-");
    const count = BigInt(row.download_count);
    names.push(name);
    counts.push(count);
  }

  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();

  try {
    console.log(`Updating downloads_4w for ${names.length} packages...`);
    const result = await client.query(
      `UPDATE packages
       SET downloads_4w = GREATEST(coalesce(downloads_4w, 0), x.count)
       FROM (SELECT unnest($1::text[]) AS name, unnest($2::bigint[]) AS count) x
       WHERE packages.name = x.name`,
      [names, counts],
    );
    console.log(`Updated ${result.rowCount} rows.`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("Backfill failed:", error);
  process.exit(1);
});
