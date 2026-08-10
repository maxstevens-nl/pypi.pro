import { Resource } from "sst";
import { BigQuery, type Job } from "@google-cloud/bigquery";
import pg from "pg";
import { copyUpsertPackages, type PackageMetadata } from "../packages/api/db/package-upsert";

const DATABASE_URL = Resource.NeonDatabase.connectionString;
const GOOGLE_PROJECT = process.env.GOOGLE_PROJECT;
const startTime = Date.now();
const BQ_PAGE_SIZE = 2_000;
const MAX_INSERT_ATTEMPTS = 4;

const args = new Set(Bun.argv.slice(2));
const dryRun = args.has("--dry-run");
const testRun = args.has("--test");
const live = args.has("--live");
const force = args.has("--force");
const limitArg = Bun.argv.find((a) => a.startsWith("--limit="));
const limit = limitArg ? parseInt(limitArg.split("=")[1]) : null;

const modes = [dryRun, testRun, limit != null, live].filter(Boolean).length;
if (modes > 1) {
  console.error("--dry-run, --test, --limit=N, and --live are mutually exclusive");
  process.exit(1);
}
if (modes === 0) {
  console.error("No mode specified. Use one of:");
  console.error("  --dry-run        Show cost estimate, no data fetched");
  console.error("  --test           Fetch 500 rows and write to database");
  console.error("  --limit=N        Fetch N rows and write to database");
  console.error("  --live           Full seed");
  console.error("  --live --force   Re-seed even if already populated");
  process.exit(1);
}

const MODE = dryRun
  ? "DRY RUN"
  : testRun
    ? `TEST RUN`
    : limit
      ? `LIMITED ${limit.toLocaleString()} rows`
      : "LIVE";

const limitClause = testRun ? "LIMIT 500" : limit ? `LIMIT ${limit}` : "";

const QUERY = `
  SELECT
    name, version, summary, description, author, license,
    classifiers, requires_python, keywords, home_page,
    CAST(UNIX_SECONDS(upload_time) AS INT64) AS updated_at
  FROM \`bigquery-public-data.pypi.distribution_metadata\`
  QUALIFY ROW_NUMBER() OVER (PARTITION BY name ORDER BY upload_time DESC) = 1
  ${limitClause}
`;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function connectDatabase(): Promise<pg.Client> {
  const client = new pg.Client({ connectionString: DATABASE_URL });
  client.on("error", () => {
    // Query failures are handled by the caller, which replaces this client.
  });
  await client.connect();
  return client;
}

async function copyPageWithRetry(client: pg.Client, rows: PackageMetadata[]): Promise<pg.Client> {
  for (let attempt = 1; attempt <= MAX_INSERT_ATTEMPTS; attempt++) {
    try {
      await copyUpsertPackages(client, rows);
      return client;
    } catch (error) {
      await client.end().catch(() => undefined);
      if (attempt === MAX_INSERT_ATTEMPTS) throw error;
      const delay = 2 ** (attempt - 1) * 1_000;
      console.error(
        `  Neon batch failed; reconnecting in ${delay / 1000}s (attempt ${attempt}/${MAX_INSERT_ATTEMPTS})`,
      );
      await sleep(delay);
      client = await connectDatabase();
    }
  }
  throw new Error("Unreachable");
}

type QueryPage = { rows: PackageMetadata[]; fetchMs: number };

async function* queryPages(job: Job): AsyncGenerator<QueryPage> {
  let nextQuery: { pageToken?: string } | undefined;
  do {
    const fetchStart = Date.now();
    const [rows, followingQuery] = nextQuery
      ? await job.getQueryResults({
          ...nextQuery,
          autoPaginate: false,
          maxResults: BQ_PAGE_SIZE,
          timeoutMs: 120_000,
        })
      : await job.getQueryResults({
          autoPaginate: false,
          maxResults: BQ_PAGE_SIZE,
          timeoutMs: 120_000,
        });
    if (rows.length > 0) {
      yield { rows: rows as PackageMetadata[], fetchMs: Date.now() - fetchStart };
    }
    nextQuery = followingQuery as { pageToken?: string } | undefined;
  } while (nextQuery);
}

console.log(`=== MODE: ${MODE} ===`);

async function main() {
  if (!GOOGLE_PROJECT) {
    throw new Error("GOOGLE_PROJECT is not set");
  }

  const bq = new BigQuery({ projectId: GOOGLE_PROJECT });

  if (dryRun) {
    const [job] = await bq.createQueryJob({ query: QUERY, dryRun: true });
    const { totalBytesProcessed } = job.metadata.statistics!;
    const gb = Math.round((Number(totalBytesProcessed) / 1e9) * 100) / 100;
    console.log(`Estimated scan: ${gb} GB`);
    console.log(`Cost: ~$${((gb / 1000) * 5).toFixed(3)} (at $5/TB)`);
    console.log();
    console.log(QUERY);
    return;
  }

  const isFullScan = !limitClause;
  if (!DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
  }

  const countClient = await connectDatabase();

  if (isFullScan) {
    const {
      rows: [{ count }],
    } = await countClient.query<{ count: string }>("SELECT count(*) FROM packages");

    if (Number(count) > 500_000 && !force) {
      console.log(`Already seeded (${count} rows). Use --force to re-seed.`);
      await countClient.end();
      process.exit(0);
    }
  }
  await countClient.end();
  let client = await connectDatabase();

  console.log(
    isFullScan ? "Fetching from BigQuery (137 GB scan, ~60s)..." : "Fetching from BigQuery...",
  );
  const queryStart = Date.now();
  const [job] = await bq.createQueryJob({ query: QUERY });
  console.log(`BigQuery job started: ${job.id}`);

  console.log("Inserting into Neon...");
  const insertsPerLog = 10;
  let rowsFetched = 0;
  let rowsInserted = 0;
  let sampleShown = false;
  let bigQueryMs = 0;
  let neonMs = 0;

  for await (const result of queryPages(job)) {
    const page = result.rows;
    bigQueryMs += result.fetchMs;
    rowsFetched += page.length;
    if (!sampleShown) {
      console.log();
      console.log("Sample (first 5):");
      for (const r of page.slice(0, 5)) {
        console.log(`  ${r.name}@${r.version} — ${(r.summary ?? "").slice(0, 80)}`);
      }
      console.log();
      sampleShown = true;
    }

    const neonStart = Date.now();
    client = await copyPageWithRetry(client, page);
    neonMs += Date.now() - neonStart;
    rowsInserted += page.length;
    if (Math.floor(rowsInserted / BQ_PAGE_SIZE) % insertsPerLog === 0) {
      const neonSec = neonMs / 1000;
      const rate = neonSec > 0 ? Math.round(rowsInserted / neonSec) : 0;
      process.stderr.write(
        `  ${rowsInserted.toLocaleString()} rows | ${rate}/s | BigQuery fetched ${rowsFetched.toLocaleString()}\n`,
      );
    }
  }

  const querySec = Math.round((Date.now() - queryStart) / 1000);
  console.log(
    `Fetched and inserted ${rowsInserted.toLocaleString()} rows from BigQuery in ${querySec}s.`,
  );
  console.log(
    `Phase timing: BigQuery result pages ${Math.round(bigQueryMs / 1000)}s, Neon COPY/merge ${Math.round(neonMs / 1000)}s.`,
  );

  if (rowsInserted > 0) {
    const insertSec = Math.round(neonMs / 1000) || 1;
    const rate = Math.round(rowsInserted / insertSec);
    process.stderr.write(`  ${rowsInserted.toLocaleString()} rows committed at ${rate}/s\n`);
  }

  const totalSec = Math.round((Date.now() - startTime) / 1000);
  await client.end();
  console.log(`\nDone. ${rowsInserted.toLocaleString()} packages in ${totalSec}s.`);
}

main().catch((err) => {
  clearInterval(0);
  console.error(err);
  process.exit(1);
});
