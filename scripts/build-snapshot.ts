import type { PackageRecord } from "../src/types";

async function main() {
  console.log("Fetching top PyPI packages by downloads...");

  const res = await fetch(
    "https://raw.githubusercontent.com/hugovk/top-pypi-packages/main/top-pypi-packages-30-days.min.json",
  );
  const data = (await res.json()) as { rows: { project: string; download_count: number }[] };
  console.log(`Found ${data.rows.length} packages`);

  const records: PackageRecord[] = [];
  const batchSize = 50;

  for (let i = 0; i < data.rows.length; i += batchSize) {
    const batch = data.rows.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(async (item): Promise<PackageRecord | null> => {
        try {
          const meta = await fetch(`https://pypi.org/pypi/${item.project}/json`).then((r) =>
            r.json(),
          );
          const info = meta.info ?? {};
          if (!info.version) return null;
          return {
            name: normalizeName(item.project),
            display_name: info.name ?? item.project,
            summary: info.summary ?? "",
            version: info.version ?? "",
            home_page: info.home_page ?? info.project_url ?? "",
            updated_at: Date.now() / 1000,
            downloads_1w: Math.floor(item.download_count / 4),
            downloads_4w: item.download_count,
            trend: 0,
          };
        } catch {
          return null;
        }
      }),
    );

    for (const r of results) {
      if (r.status === "fulfilled" && r.value) {
        records.push(r.value);
      }
    }

    console.log(`Processed ${i + batch.length}/${data.rows.length}`);
  }

  const ndjson = records.map((r) => JSON.stringify(r)).join("\n");
  await Bun.write("snapshot.ndjson", ndjson);
  console.log(`Wrote ${records.length} records to snapshot.ndjson`);
}

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[-_.]+/g, "-");
}

main().catch(console.error);
