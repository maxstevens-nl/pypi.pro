import { BigQuery } from "cfw-bq";
import { Client } from "pg";
import { Resource } from "sst";
import { upsertPackages, type PackageMetadata } from "./db/package-upsert";

export default {
  async scheduled(
    _event: ScheduledEvent,
    _env: unknown,
    ctx: ExecutionContext,
  ) {
    const key = JSON.parse(Resource.GcpServiceAccountKey.value);
    const bq = new BigQuery(key, Resource.GcpConfig.project);

    const changed = await bq.query<{ name: string }>(`
      SELECT DISTINCT name
      FROM \`bigquery-public-data.pypi.distribution_metadata\`
      WHERE upload_time > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 1 DAY)
    `);

    if (changed.length === 0) {
      console.log("No new releases, skipping.");
      return;
    }

    console.log(`${changed.length} packages with new releases`);
    const nameList = changed
      .map((r) => `'${r.name.replace(/'/g, "''")}'`)
      .join(",");

    const rows = await bq.query<PackageMetadata>(`
      SELECT
        name, version, summary, description, author, license,
        classifiers, requires_python, keywords, home_page,
        CAST(UNIX_SECONDS(upload_time) AS INT64) AS updated_at
      FROM \`bigquery-public-data.pypi.distribution_metadata\`
      WHERE name IN (${nameList})
      QUALIFY ROW_NUMBER() OVER (PARTITION BY name ORDER BY upload_time DESC) = 1
    `);

    const client = new Client({
      connectionString: Resource.Database.connectionString,
    });
    await client.connect();

    try {
      await upsertPackages(client, rows);
      console.log(`Upserted ${rows.length} packages.`);
    } finally {
      ctx.waitUntil(client.end());
    }
  },
};
