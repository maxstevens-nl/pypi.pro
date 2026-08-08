// Bulk import-name detection over the package snapshot. Reads
// .data/snapshot.ndjson (one package per line), looks each package up by its
// display_name, and writes the results to a CSV.
//
// Usage:
//   bun scripts/detect-import-name-snapshot.ts                     # full run
//   bun scripts/detect-import-name-snapshot.ts --limit=100          # first 100
//   bun scripts/detect-import-name-snapshot.ts --concurrency=8      # throttle
//   bun scripts/detect-import-name-snapshot.ts --force              # redo already-processed
//   bun scripts/detect-import-name-snapshot.ts --output=out.csv     # custom path
//
// Already-processed packages are skipped by default (rows present in the
// output CSV), so an interrupted run can be resumed by re-running the command.

import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import { detectOne, SCRATCH } from "./import-name";

const SNAPSHOT = ".data/snapshot.ndjson";

const args = Bun.argv.slice(2);
const outputArg = args.find((a) => a.startsWith("--output="));
const output = outputArg ? outputArg.split("=")[1] : ".data/import-names.csv";
const limitArg = args.find((a) => a.startsWith("--limit="));
const limit = limitArg ? parseInt(limitArg.split("=")[1], 10) : null;
const concurrencyArg = args.find((a) => a.startsWith("--concurrency="));
const concurrency = concurrencyArg ? parseInt(concurrencyArg.split("=")[1], 10) : 24;
const noCache = args.includes("--no-cache");
const force = args.includes("--force");

type Row = {
  display_name: string;
  distribution?: string;
  version?: string;
  filename?: string;
  import_names?: string[];
  error?: string;
};

function csvField(v: string): string {
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

function toCsvLine(row: Row): string {
  const fields = [
    row.display_name,
    row.distribution ?? "",
    row.version ?? "",
    row.filename ?? "",
    (row.import_names ?? []).join("|"),
    row.error ?? "",
  ];
  return fields.map(csvField).join(",");
}

async function readExistingNames(path: string): Promise<Set<string>> {
  if (!existsSync(path)) return new Set();
  const text = await Bun.file(path).text();
  const names = new Set<string>();
  for (const line of text.split("\n").slice(1)) {
    if (!line.trim()) continue;
    const first = line.split(",")[0].trim();
    if (!first) continue;
    names.add(first.replace(/^"|"$/g, ""));
  }
  return names;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= attempts) throw error;
      const delay = 1_000 * 2 ** (attempt - 1);
      console.error(`  retrying after ${delay / 1000}s: ${error}`);
      await sleep(delay);
    }
  }
}

async function main() {
  if (!existsSync(SNAPSHOT)) throw new Error(`${SNAPSHOT} not found`);
  mkdirSync(SCRATCH, { recursive: true });

  const text = await Bun.file(SNAPSHOT).text();
  const lines = text.split("\n").filter(Boolean);
  const names = [
    ...new Set(
      lines
        .map((line) => (JSON.parse(line) as { display_name?: string }).display_name)
        .filter((n): n is string => Boolean(n)),
    ),
  ];
  const selected = limit ? names.slice(0, limit) : names;
  console.log(`Found ${names.length} packages in ${SNAPSHOT}; processing ${selected.length}`);

  const skip = force ? new Set<string>() : await readExistingNames(output);
  if (skip.size > 0) console.log(`Skipping ${skip.size} already in ${output}`);

  let done = 0;
  let errors = 0;
  let next = 0;
  const start = Date.now();

  const newFile = !existsSync(output);
  const stream = createWriteStream(output, { flags: newFile ? "w" : "a" });
  if (newFile) stream.write("display_name,distribution,version,filename,import_names,error\n");

  const append = (row: Row) => {
    stream.write(toCsvLine(row) + "\n");
  };

  async function worker() {
    while (true) {
      const i = next++;
      if (i >= selected.length) return;
      const name = selected[i];
      if (skip.has(name)) continue;
      try {
        const result = await withRetry(() => detectOne(name, { noCache }));
        append({ display_name: name, ...result });
      } catch (error) {
        errors++;
        append({ display_name: name, error: String(error) });
      }
      done++;
      if (done % 50 === 0 || done === selected.length) {
        const sec = (Date.now() - start) / 1000;
        const rate = sec > 0 ? Math.round(done / sec) : 0;
        console.error(`  ${done}/${selected.length} (${rate}/s, ${errors} errors)`);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  const sec = Math.round((Date.now() - start) / 1000);
  stream.end();
  console.log(`\nDone: ${done} processed, ${errors} errors, in ${sec}s.`);
  console.log(`Results written to ${output}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
