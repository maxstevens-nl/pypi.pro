import { Resource } from "sst";
import { search, ingest, health } from "./search";
import { getDb } from "./db";

export default {
  async fetch(req: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const startTime = Date.now();
    const requestId = crypto.randomUUID();
    const url = new URL(req.url);

    console.log(JSON.stringify({
      level: "info",
      requestId,
      method: req.method,
      path: url.pathname,
      query: url.search,
      cfRay: req.headers.get("cf-ray"),
      country: req.headers.get("cf-ipcountry"),
    }));

    try {
      let response: Response;

      const db = getDb(env);

      if (url.pathname === "/api/search") {
        response = await handleSearch(db, url);
      } else if (url.pathname === "/ingest" && req.method === "POST") {
        response = await handleIngest(req, db, requestId);
      } else if (url.pathname === "/bootstrap" && req.method === "POST") {
        response = await handleBootstrap(req, db, requestId);
      } else if (url.pathname === "/health") {
        response = await handleHealth(db);
      } else if (env.ASSETS) {
        response = await env.ASSETS.fetch(req);
      } else {
        response = new Response("not found", { status: 404 });
      }

      const duration = Date.now() - startTime;
      console.log(JSON.stringify({
        level: "info",
        requestId,
        status: response.status,
        duration,
      }));

      return response;
    } catch (error) {
      const duration = Date.now() - startTime;
      console.log(JSON.stringify({
        level: "error",
        requestId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        duration,
      }));
      return new Response("internal error", { status: 500 });
    }
  },
};

async function handleSearch(db: import("./db").Db, url: URL): Promise<Response> {
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  if (!q) return json({ hits: [] });

  const result = await search(db, q);

  return new Response(JSON.stringify(result), {
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
    },
  });
}

async function handleIngest(req: Request, db: import("./db").Db, requestId: string): Promise<Response> {
  const body = await req.text();
  const records = JSON.parse(body);
  const count = records.records?.length ?? 0;

  console.log(JSON.stringify({
    level: "info",
    requestId,
    event: "ingest_start",
    recordCount: count,
  }));

  const result = await ingest(db, records.records || []);

  console.log(JSON.stringify({
    level: "info",
    requestId,
    event: "ingest_complete",
    count: result.count,
  }));

  return json(result);
}

async function handleBootstrap(_req: Request, db: import("./db").Db, requestId: string): Promise<Response> {
  const logs: string[] = [];
  const log = (msg: string) => {
    logs.push(msg);
    console.log(JSON.stringify({ level: "info", requestId, msg }));
  };

  try {
    log("bootstrap_start");
    log(`Resource.Snapshots exists: ${!!Resource.Snapshots}`);
    log(`Resource keys: ${Object.keys(Resource).join(", ")}`);

    if (!Resource.Snapshots) {
      return new Response(`Resource.Snapshots is undefined. Available: ${Object.keys(Resource).join(", ")}`, { status: 500 });
    }

    const object = await Resource.Snapshots.get("snapshot.ndjson");
    log(`Got object from R2: ${!!object}`);

    if (!object) {
      return new Response("snapshot not found", { status: 404 });
    }

    const body = await object.text();
    const lines = body.split("\n").filter((l: string) => l.trim());
    const records = [];

    for (const line of lines) {
      try {
        records.push(JSON.parse(line));
      } catch {}
    }

    log(`Parsed ${records.length} records from R2`);

    const result = await ingest(db, records);
    log(`bootstrap_complete: ${JSON.stringify(result)}`);

    return json(result);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log(`bootstrap_error: ${errorMsg}`);
    return new Response(`bootstrap failed: ${errorMsg}\n\nLogs:\n${logs.join("\n")}`, { status: 500 });
  }
}

async function handleHealth(db: import("./db").Db): Promise<Response> {
  const result = await health(db);
  return json(result);
}

const json = (o: unknown) =>
  new Response(JSON.stringify(o), {
    headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
  });
