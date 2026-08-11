import postgres from "postgres";

const DATABASE_URL = Bun.env.DATABASE_URL;
const TYPESENSE_API_KEY = Bun.env.TYPESENSE_API_KEY;
const TYPESENSE_URL = Bun.env.TYPESENSE_URL;

if (!DATABASE_URL) throw new Error("DATABASE_URL is required");
if (!TYPESENSE_API_KEY) throw new Error("TYPESENSE_API_KEY is required");
if (!TYPESENSE_URL) throw new Error("TYPESENSE_URL is required");

const COLLECTION = Bun.env.TYPESENSE_COLLECTION ?? "packages";
const BATCH_SIZE = 1000;

const sql = postgres(DATABASE_URL, { max: 3 });

const COLLECTION_SCHEMA = {
  name: COLLECTION,
  fields: [
    { name: "name", type: "string" },
    { name: "summary", type: "string" },
    { name: "version", type: "string" },
    { name: "home_page", type: "string" },
    { name: "updated_at", type: "int64" },
    { name: "description", type: "string" },
    { name: "author", type: "string" },
    { name: "license", type: "string" },
    { name: "classifiers", type: "string[]", facet: true },
    { name: "requires_python", type: "string" },
    { name: "keywords", type: "string" },
    { name: "downloads_4w", type: "int64", sort: true },
    { name: "normalized_name", type: "string" },
    { name: "import_names", type: "string[]" },
  ],
  default_sorting_field: "downloads_4w",
};

async function ensureCollection() {
  const resp = await fetch(`${TYPESENSE_URL}/collections/${COLLECTION}`, {
    headers: { "X-TYPESENSE-API-KEY": TYPESENSE_API_KEY! },
  });
  if (resp.ok) return;

  const createResp = await fetch(`${TYPESENSE_URL}/collections`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-TYPESENSE-API-KEY": TYPESENSE_API_KEY!,
    },
    body: JSON.stringify(COLLECTION_SCHEMA),
  });

  if (!createResp.ok && createResp.status !== 409) {
    throw new Error(`Failed to create collection: ${await createResp.text()}`);
  }

  console.log(`Collection '${COLLECTION}' ready`);
}

async function getLastSync() {
  const [row] = await sql`
    SELECT last_sync FROM last_sync WHERE service = 'typesense'
  `;
  return row ? Number(row.last_sync) : 0;
}

async function getPackages(since: number) {
  return sql`
    SELECT name, summary, version, home_page, updated_at, description,
           author, license, classifiers, requires_python, keywords,
           downloads_4w, normalized_name, import_names,
           xmin::text::bigint AS xmin
    FROM packages
    WHERE xmin::text::bigint > ${since}
    ORDER BY xmin ASC
  `;
}

function docFromPkg(pkg: any) {
  return {
    id: pkg.name,
    name: pkg.name,
    summary: pkg.summary ?? "",
    version: pkg.version ?? "",
    home_page: pkg.home_page ?? "",
    updated_at: Number(pkg.updated_at ?? 0),
    description: pkg.description ?? "",
    author: pkg.author ?? "",
    license: pkg.license ?? "",
    classifiers: pkg.classifiers ?? [],
    requires_python: pkg.requires_python ?? "",
    keywords: pkg.keywords ?? "",
    downloads_4w: Number(pkg.downloads_4w ?? 0),
    normalized_name: pkg.normalized_name ?? "",
    import_names: pkg.import_names ?? [],
  };
}

async function importBatch(documents: any[]) {
  const body = documents.map((d) => JSON.stringify(d)).join("\n");

  const resp = await fetch(
    `${TYPESENSE_URL}/collections/${COLLECTION}/documents/import?action=upsert`,
    {
      method: "POST",
      headers: {
        "Content-Type": "text/plain",
        "X-TYPESENSE-API-KEY": TYPESENSE_API_KEY!,
      },
      body,
    },
  );

  if (!resp.ok) {
    throw new Error(`Typesense import failed (${resp.status}): ${await resp.text()}`);
  }

  const text = await resp.text();
  if (!text.trim()) return [];

  return text
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
}

async function updateLastSync(xmin: number) {
  await sql`
    INSERT INTO last_sync (service, last_sync) VALUES ('typesense', ${xmin})
    ON CONFLICT (service) DO UPDATE SET last_sync = ${xmin}
  `;
  console.log(`Updated last_sync to ${xmin}`);
}

async function main() {
  console.log("Ensuring Typesense collection...");
  await ensureCollection();

  const lastSync = await getLastSync();
  console.log(`Last sync xmin: ${lastSync}`);

  const packages = await getPackages(lastSync);
  console.log(`Found ${packages.length} packages to sync`);

  if (packages.length === 0) {
    console.log("Nothing to sync");
    return;
  }

  let totalSuccess = 0;
  let totalFailed = 0;
  let maxXmin = lastSync;
  const totalBatches = Math.ceil(packages.length / BATCH_SIZE);

  for (let i = 0; i < packages.length; i += BATCH_SIZE) {
    const batch = packages.slice(i, i + BATCH_SIZE);
    const batchMaxXmin = Math.max(...batch.map((p) => Number(p.xmin)));
    const documents = batch.map(docFromPkg);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;

    const results = await importBatch(documents);
    const failures = results.filter((r: any) => !r.success);

    if (failures.length > 0) {
      console.error(`Batch ${batchNum}/${totalBatches}: ${failures.length} failures`);
      for (const f of failures.slice(0, 10)) {
        console.error(`  ${f.document}: ${f.error}`);
      }
      if (failures.length > 10) {
        console.error(`  ... and ${failures.length - 10} more`);
      }
    }

    totalSuccess += results.length - failures.length;
    totalFailed += failures.length;
    maxXmin = Math.max(maxXmin, batchMaxXmin);

    console.log(
      `Batch ${batchNum}/${totalBatches}: ${results.length - failures.length}/${results.length} ok`,
    );
  }

  await updateLastSync(maxXmin);

  console.log(`Done. Success: ${totalSuccess}, Failed: ${totalFailed}`);
}

main()
  .catch((err) => {
    console.error("Sync failed:", err);
    process.exit(1);
  })
  .finally(() => sql.end());
