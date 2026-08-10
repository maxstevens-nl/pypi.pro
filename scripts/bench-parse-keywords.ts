// Benchmark for parseKeywords over the real PyPI keyword corpus in
// .data/output.sqlite (~358k non-empty keyword strings).
//
// Compares the optimized single-pass scanner (src/parse-keywords.ts)
// against a naive regex/split-based baseline with the same semantics,
// and cross-checks that both agree on every entry.
//
// Usage: bun scripts/bench-parse-keywords.ts [rounds=5]

import { Database } from "bun:sqlite";
import { parseKeywords } from "../src/parse-keywords";

const DB_PATH = new URL("../.data/output.sqlite", import.meta.url).pathname;
const rounds = Number(Bun.argv[2]) || 5;

// Naive baseline: the straightforward regex implementation parseKeywords
// was written to beat. Semantically equivalent, but does a regex scan per
// string plus per-token regex replaces, and allocates RegExp match objects.
function parseKeywordsNaive(keywords: string): string[] {
  const commaMode = keywords.includes(",");
  const pattern = commaMode ? /"([^"]*)"|[^,]+/g : /"([^"]*)"|[^\s]+/g;
  const out: string[] = [];
  for (const m of keywords.matchAll(pattern)) {
    const token = m[1] === undefined ? m[0].replace(/^[\s'"]+|[\s'"]+$/g, "") : m[1];
    if (token) out.push(token);
  }
  return out;
}

function bench(fn: (s: string) => string[], data: string[]): { best: number; total: number; sink: number } {
  let sink = 0;
  for (const s of data) sink += fn(s).length; // warmup
  let best = Infinity;
  let total = 0;
  for (let r = 0; r < rounds; r++) {
    const t0 = performance.now();
    for (const s of data) sink += fn(s).length;
    const ms = performance.now() - t0;
    total += ms;
    if (ms < best) best = ms;
  }
  return { best, total: total / rounds, sink };
}

const db = new Database(DB_PATH, { readonly: true });
const rows = db.query("SELECT keywords FROM packages WHERE keywords IS NOT NULL AND keywords != ''").all() as {
  keywords: string;
}[];
db.close();

const data = rows.map((r) => r.keywords);
const chars = data.reduce((n, s) => n + s.length, 0);
console.log(`corpus: ${data.length} entries, ${(chars / 1e6).toFixed(1)} MB of keyword text, ${rounds} rounds\n`);

// Correctness cross-check: both implementations must agree everywhere.
let mismatches = 0;
for (const s of data) {
  if (parseKeywords(s).join("\0") !== parseKeywordsNaive(s).join("\0")) mismatches++;
}
console.log(`mismatches between fast and naive: ${mismatches}\n`);

const results: number[] = [];
for (const [label, fn] of [
  ["naive (regex)", parseKeywordsNaive],
  ["fast (single-pass)", parseKeywords],
] as const) {
  const { best, total } = bench(fn, data);
  results.push(best);
  console.log(
    `${label.padEnd(20)} best ${best.toFixed(1).padStart(7)} ms  avg ${total.toFixed(1).padStart(7)} ms` +
      `  |  ${((chars / best) * 1000 / 1e6).toFixed(0).padStart(5)} MB/s  ${((best * 1e6) / data.length).toFixed(0).padStart(5)} ns/entry`,
  );
}

console.log(`\nspeedup: ${(results[0] / results[1]).toFixed(2)}x`);
