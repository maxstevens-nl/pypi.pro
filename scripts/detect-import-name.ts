// Determine the import name(s) a PyPI distribution registers — what you
// `import` after `pip install <dist>`. See scripts/import-name.ts for how the
// name is computed.
//
// Usage:
//   bun scripts/detect-import-name.ts requests django beautifulsoup4
//   bun scripts/detect-import-name.ts --json requests django
//   bun scripts/detect-import-name.ts --json < packages.txt
//
// For the bulk snapshot run (reads .data/snapshot.ndjson, writes CSV), use
// `bun scripts/detect-import-name-snapshot.ts` instead.

import { mkdirSync } from "node:fs";
import { detectOne, SCRATCH, type Result } from "./import-name";

const args = Bun.argv.slice(2);
const asJson = args.includes("--json");
const requested = args.filter((a) => !a.startsWith("--"));

async function main() {
  let names = requested;
  if (names.length === 0) {
    const stdin = await Bun.stdin.text();
    names = stdin
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (names.length === 0) {
    console.error("Usage: bun scripts/detect-import-name.ts [--json] <package> [package ...]");
    console.error("       bun scripts/detect-import-name.ts < packages.txt");
    process.exit(1);
  }

  mkdirSync(SCRATCH, { recursive: true });

  const results: Result[] = [];
  for (const name of names) {
    try {
      results.push(await detectOne(name));
    } catch (error) {
      results.push({ distribution: name, error: String(error) });
    }
  }

  if (asJson) {
    for (const r of results) console.log(JSON.stringify(r));
    return;
  }
  const width = Math.max(...results.map((r) => r.distribution.length), "distribution".length);
  console.log(`${"distribution".padEnd(width)}\timport name(s)`);
  console.log("-".repeat(width) + "\t------------");
  for (const r of results) {
    const cell = r.error ?? r.import_names?.join(", ") ?? "";
    console.log(`${r.distribution.padEnd(width)}\t${cell}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
