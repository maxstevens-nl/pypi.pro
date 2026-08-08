// Core import-name detection shared by the CLI (`detect-import-name.ts`) and
// the bulk snapshot runner (`detect-import-name-snapshot.ts`).
//
// Determine the import name(s) a PyPI distribution registers — what you
// `import` after `pip install <dist>`:
//
//   distribution                    import name
//   Django                          django
//   beautifulsoup4                  bs4
//   Pillow                          PIL
//   scikit-learn                    sklearn
//   opentelemetry-instrumentation-mistralai  opentelemetry.instrumentation.mistralai
//
// The import name is the deepest namespace the distribution owns: the longest
// common directory prefix across every file in the wheel/sdist. Namespace
// packages with siblings share their parent, so a wheel that ships only
// `opentelemetry/instrumentation/mistralai/` reports
// `opentelemetry.instrumentation.mistralai`, while one that also shipped an
// `openai/` sibling would report `opentelemetry.instrumentation`. When there
// is no common prefix (e.g. pytest ships both `_pytest/` and `pytest/`), the
// top-level package/module names are listed instead. `top_level.txt` is used
// only as a last resort.
//
// Downloads are cached under .data/import-name/ (gitignored).

import { existsSync } from "node:fs";
import path from "node:path";
import { $ } from "bun";

export const SCRATCH = path.join(".data", "import-name");

type PyPIFile = {
  filename: string;
  url: string;
  packagetype: string;
};

type PyPIResponse = {
  info: { name: string; version: string };
  urls: PyPIFile[];
};

export type Result = {
  distribution: string;
  version?: string;
  filename?: string;
  import_names?: string[];
  error?: string;
};

export type DetectOptions = {
  noCache?: boolean;
};

function pickFile(files: PyPIFile[]): PyPIFile | undefined {
  const isWheel = (f: PyPIFile) => f.packagetype === "bdist_wheel";
  return (
    files.find((f) => isWheel(f) && f.filename.includes("py3-none-any")) ??
    files.find(isWheel) ??
    files.find((f) => f.packagetype === "sdist")
  );
}

async function fetchPyPI(name: string): Promise<PyPIResponse> {
  const res = await fetch(`https://pypi.org/pypi/${encodeURIComponent(name)}/json`);
  if (!res.ok) {
    throw new Error(`PyPI API for "${name}" failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as PyPIResponse;
}

async function listZip(zipPath: string): Promise<string[]> {
  const out = await $`unzip -Z1 ${zipPath}`.text();
  return out.split("\n").filter(Boolean);
}

async function readZipEntry(zipPath: string, entry: string): Promise<string> {
  const out = await $`unzip -p ${zipPath} ${entry}`.text();
  return out.replace(/\r\n/g, "\n");
}

async function listTar(tarPath: string): Promise<string[]> {
  const out = await $`tar -tzf ${tarPath}`.text();
  return out.split("\n").filter(Boolean);
}

async function readTarEntry(tarPath: string, entry: string): Promise<string> {
  const out = await $`tar -xzOf ${tarPath} ${entry}`.text();
  return out.replace(/\r\n/g, "\n");
}

function parseTopLevelText(text: string): string[] {
  return text
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

const SDIST_METADATA = new Set([
  "pkg-info",
  "readme",
  "readme.txt",
  "readme.rst",
  "readme.md",
  "license",
  "licence",
  "license.txt",
  "authors",
  "changelog",
  "news",
  "setup.py",
  "setup.cfg",
  "pyproject.toml",
  "requirements.txt",
  "requirements-dev.txt",
  "manifest.in",
  "tox.ini",
  "pytest.ini",
  "conftest.py",
  "docs",
  "doc",
  "examples",
  "example",
  "tests",
  "test",
  "benchmarks",
  "scripts",
]);

function isNoisePath(p: string): boolean {
  if (p.includes(".dist-info/") || p.includes(".egg-info/")) return true;
  return p
    .split("/")
    .some((s) => s === ".data" || s.endsWith(".data") || s === "__pycache__");
}

function isNoiseTopLevel(seg: string): boolean {
  const base = seg.toLowerCase();
  if (seg === ".data" || seg === "__pycache__") return true;
  if (seg.endsWith(".dist-info") || seg.endsWith(".egg-info")) return true;
  if (seg.endsWith(".libs") || seg.endsWith(".pth") || seg.endsWith(".pyc")) return true;
  if (base === "py.typed") return true;
  return SDIST_METADATA.has(base);
}

function longestCommonPrefix(rows: string[][]): string[] {
  if (rows.length === 0) return [];
  const first = rows[0];
  let i = 0;
  while (i < first.length && rows.every((r) => r[i] === first[i])) i++;
  return first.slice(0, i);
}

// Infer the import name(s) from an archive's file listing. The primary signal
// is the longest common directory prefix across every shipped file — the
// deepest namespace the distribution owns. Sibling packages share their
// parent, so a wheel shipping both `a/b/x/` and `a/b/y/` reports `a.b` while
// one shipping only `a/b/x/` reports `a.b.x`. When there is no common prefix
// (multiple disjoint top-level packages, e.g. pytest's `_pytest` + `pytest`),
// fall back to listing the top-level package/module names.
function inferImportNames(entries: string[]): string[] {
  const clean = entries
    .map((p) => p.replace(/^\.\//, ""))
    .filter((p) => p && !isNoisePath(p));
  if (clean.length === 0) return [];

  const files = clean.filter((p) => !p.endsWith("/"));
  if (files.length > 0) {
    const common = longestCommonPrefix(files.map((p) => p.split("/").slice(0, -1)));
    if (common.length > 0) return [common.join(".")];
  }

  const top = new Set<string>();
  for (const p of clean) {
    const parts = p.split("/");
    const seg = parts[0];
    if (!seg || isNoiseTopLevel(seg)) continue;
    if (parts.length === 1) {
      // A bare file at the top level is only importable as a single module
      // (e.g. six.py, docopt.py); everything else is metadata (PKG-INFO,
      // LICENSE-MIT, README.rst, ...).
      if (!/\.(py|pyi)$/.test(seg)) continue;
      top.add(seg.slice(0, seg.lastIndexOf(".")));
    } else {
      top.add(seg);
    }
  }
  return [...top].sort();
}

async function detectFromWheel(zipPath: string): Promise<string[]> {
  const entries = await listZip(zipPath);
  const inferred = inferImportNames(entries);
  if (inferred.length > 0) return inferred;
  const tlEntry = entries.find(
    (e) => e.includes(".dist-info") && e.endsWith("/top_level.txt"),
  );
  return tlEntry ? parseTopLevelText(await readZipEntry(zipPath, tlEntry)) : [];
}

async function detectFromSdist(tarPath: string): Promise<string[]> {
  const entries = await listTar(tarPath);
  // sdists pack everything under a single "<name>-<version>/" wrapper; strip
  // it so inference sees the same layout as a wheel. Only strip when every
  // entry shares the same first segment, so a wrapper-less sdist still works.
  const firstSegs = new Set(entries.map((p) => p.split("/")[0]).filter(Boolean));
  const stripped =
    firstSegs.size === 1
      ? entries.map((p) => p.split("/").slice(1).join("/")).filter(Boolean)
      : entries;
  const inferred = inferImportNames(stripped);
  if (inferred.length > 0) return inferred;
  const tlEntry = stripped.find(
    (e) => e.includes(".egg-info") && e.endsWith("/top_level.txt"),
  );
  return tlEntry ? parseTopLevelText(await readTarEntry(tarPath, tlEntry)) : [];
}

export async function detectOne(name: string, opts: DetectOptions = {}): Promise<Result> {
  const pypi = await fetchPyPI(name);
  const distribution = pypi.info.name;
  const file = pickFile(pypi.urls);
  if (!file) throw new Error(`${distribution}: no wheel or sdist found`);

  const cachePath = path.join(SCRATCH, file.filename);
  if (opts.noCache || !existsSync(cachePath)) {
    const res = await fetch(file.url);
    if (!res.ok) throw new Error(`download of ${file.filename} failed: ${res.status}`);
    await Bun.write(cachePath, await res.arrayBuffer());
  }

  const importNames =
    file.packagetype === "bdist_wheel"
      ? await detectFromWheel(cachePath)
      : await detectFromSdist(cachePath);

  return {
    distribution,
    version: pypi.info.version,
    filename: file.filename,
    import_names: importNames,
  };
}
