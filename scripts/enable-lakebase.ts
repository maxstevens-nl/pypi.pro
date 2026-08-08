// One-time setup: enable the Lakebase Search preload libraries on the Neon
// project so `CREATE EXTENSION lakebase_text` (and lakebase_vector) work.
//
// Lakebase Search is enabled per Neon project via the Neon API; this script
// re-sends the existing preload list with the lakebase libraries appended,
// then restarts active computes so the setting takes effect.
//
// Usage:
//   NEON_API_KEY=napi_... bun scripts/enable-lakebase.ts
//
// Prerequisites: NEON_API_KEY in env (or .env). Lakebase Search must be
// available on the project — if the account lacks access, the script reports
// which libraries are missing.

const API_BASE = "https://console.neon.tech/api/v2";
const PROJECT_ID = process.env.NEON_PROJECT_ID ?? "ancient-butterfly-95061725";
const LAKEBASE_LIBS = ["lakebase_vector", "lakebase_text"];

const apiKey = process.env.NEON_API_KEY;
if (!apiKey) {
  console.error("NEON_API_KEY is not set. Copy .env.example and add your key.");
  process.exit(1);
}

const headers = {
  authorization: `Bearer ${apiKey}`,
  accept: "application/json",
  "content-type": "application/json",
};

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { headers });
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

async function patch(path: string, body: unknown): Promise<void> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PATCH ${path} failed: ${res.status} ${await res.text()}`);
}

async function main() {
  console.log(`Project: ${PROJECT_ID}`);

  const available = await get<{
    libraries: { library_name: string; is_default?: boolean }[];
  }>(`/projects/${PROJECT_ID}/available_preload_libraries`);

  const names = available.libraries.map((l) => l.library_name);
  const missing = LAKEBASE_LIBS.filter((lib) => !names.includes(lib));
  if (missing.length > 0) {
    console.error(
      `Lakebase Search is not available on this project. Missing: ${missing.join(", ")}.\n` +
        "Request access from Neon before running this script.",
    );
    process.exit(1);
  }
  console.log(`Available: ${LAKEBASE_LIBS.join(", ")}`);

  const project = await get<{
    project: {
      settings?: { preload_libraries?: { enabled_libraries?: string[] } };
    };
  }>(`/projects/${PROJECT_ID}`);

  const defaults = available.libraries
    .filter((l) => l.is_default)
    .flatMap((l) => l.library_name.split(","))
    .map((s) => s.trim())
    .filter(Boolean);
  const current = project.project.settings?.preload_libraries?.enabled_libraries ?? [];
  const enabled = [...new Set([...defaults, ...current, ...LAKEBASE_LIBS])];

  console.log(`Enabled preload libraries: ${enabled.join(", ")}`);

  await patch(`/projects/${PROJECT_ID}`, {
    project: { settings: { preload_libraries: { enabled_libraries: enabled } } },
  });
  console.log("Preload libraries updated.");

  const { endpoints } = await get<{ endpoints: { id: string }[] }>(
    `/projects/${PROJECT_ID}/endpoints`,
  );
  for (const { id } of endpoints) {
    try {
      const res = await fetch(`${API_BASE}/projects/${PROJECT_ID}/endpoints/${id}/restart`, {
        method: "POST",
        headers,
      });
      if (!res.ok) {
        const text = await res.text();
        if (text.includes("not active")) {
          console.log(`Endpoint ${id}: idle, will pick up the change on next wake.`);
        } else {
          console.warn(`Endpoint ${id} restart failed: ${res.status} ${text}`);
        }
      } else {
        console.log(`Endpoint ${id}: restarted.`);
      }
    } catch (error) {
      console.warn(`Endpoint ${id} restart error: ${error}`);
    }
  }

  console.log(
    "\nNext steps:\n" +
      "  1. Deploy so the lakebase migration runs (CREATE EXTENSION IF NOT EXISTS lakebase_text).\n" +
      "  2. After bulk-loading data, run VACUUM to keep BM25 corpus statistics accurate.",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
