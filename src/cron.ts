import type { PackageRecord } from "./types";

export default {
  async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext) {
    const mode = (env as any).MODE ?? "metadata";

    if (mode === "downloads") {
      await syncDownloads(env);
    } else {
      await syncMetadata(env);
    }
  },
};

async function syncMetadata(env: Env) {
  const res = await fetch("https://pypi.org/rss/updates.xml");
  const xml = await res.text();
  const matches = xml.match(/<title><!\[CDATA\[([^\]]+)\]\]><\/title>/g) ?? [];

  const names = matches
    .map(m => m.replace(/<title><!\[CDATA\[([^\]]+)\]\]><\/title>/, "$1"))
    .filter(n => n && !n.includes("PyPI"))
    .slice(0, 1000);

  const records: PackageRecord[] = [];
  for (const name of names) {
    try {
      const meta = await fetch(`https://pypi.org/pypi/${name}/json`).then(r => r.json() as Promise<{ info: Record<string, string> }>);
      const info = meta.info ?? {};
      records.push({
        name: normalizeName(name),
        display_name: info.name ?? name,
        summary: info.summary ?? "",
        version: info.version ?? "",
        home_page: info.home_page ?? info.project_url ?? "",
        updated_at: Date.now() / 1000,
      });
    } catch {}
  }

  if (records.length > 0) {
    await env.INGEST.send(records);
  }
}

async function syncDownloads(_env: Env) {
  // BigQuery downloads sync would go here
  // For now, this is a placeholder for the weekly downloads refresh
}

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[-_.]+/g, "-");
}
