import { Resource } from "sst";
import { readFileSync } from "node:fs";
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { packages } from "../src/schema";
import type { PackageRecord } from "../src/types";

const stage = process.env.SST_STAGE;
const connectionString = process.env.DATABASE_URL ?? Resource.NeonDatabase.connectionString;
const snapshotPath = process.env.SNAPSHOT_PATH ?? "snapshot.ndjson";
const batchSize = 250;

async function main() {
  if (!stage || stage === "prod") {
    throw new Error("The sample seed is only allowed for non-production stages");
  }
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  const sql = neon(connectionString);
  const db = drizzle(sql);
  const [{ count }] = await sql`SELECT count(*)::int AS count FROM packages`;
  if (count > 0) {
    console.log(`Seed skipped: packages table already has ${count} rows.`);
    return;
  }

  const records = readFileSync(snapshotPath, "utf8")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as PackageRecord);

  if (records.length === 0) {
    throw new Error(`No records found in ${snapshotPath}`);
  }

  for (let offset = 0; offset < records.length; offset += batchSize) {
    const batch = records.slice(offset, offset + batchSize).map((record) => ({
      name: record.name,
      summary: record.summary,
      version: record.version,
      homePage: record.home_page,
      updatedAt: Math.floor(record.updated_at),
      downloads1w: record.downloads_1w ?? 0,
      downloads4w: record.downloads_4w ?? 0,
      downloads52w: record.downloads_52w,
    }));

    await db.insert(packages).values(batch).onConflictDoNothing();
    console.log(
      `Seeded ${Math.min(offset + batchSize, records.length)}/${records.length} packages.`,
    );
  }
}

main().catch((error) => {
  console.error("Error during sample seed:", error);
  process.exit(1);
});
