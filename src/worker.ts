import { Resource } from "sst";

export { SearchIndex } from "./search-index";

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
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

      if (url.pathname === "/api/search") {
        response = await handleSearch(req, env, ctx, url, requestId);
      } else if (url.pathname === "/ingest" && req.method === "POST") {
        response = await handleIngest(req, env, requestId);
      } else if (url.pathname === "/bootstrap" && req.method === "POST") {
        response = await handleBootstrap(req, env, requestId);
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

async function handleSearch(
  req: Request,
  env: Env,
  ctx: ExecutionContext,
  url: URL,
  requestId: string
): Promise<Response> {
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  if (!q) return json({ hits: [] });

  const stub = env.SEARCH_INDEX.getByName("pypi");
  const res = await stub.fetch(`https://do.local/search?q=${encodeURIComponent(q)}`);

  return new Response(res.body, {
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
    },
  });
}

async function handleIngest(req: Request, env: Env, requestId: string): Promise<Response> {
  const body = await req.text();
  const records = JSON.parse(body);
  const count = records.records?.length ?? 0;

  console.log(JSON.stringify({
    level: "info",
    requestId,
    event: "ingest_start",
    recordCount: count,
  }));

  const stub = env.SEARCH_INDEX.getByName("pypi");
  const res = await stub.fetch("https://do.local/ingest", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });

  console.log(JSON.stringify({
    level: "info",
    requestId,
    event: "ingest_complete",
    status: res.status,
  }));

  return res;
}

async function handleBootstrap(req: Request, env: Env, requestId: string): Promise<Response> {
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
    const lines = body.split("\n").filter(l => l.trim());
    const records = [];

    for (const line of lines) {
      try {
        records.push(JSON.parse(line));
      } catch {}
    }

    log(`Parsed ${records.length} records from R2`);

    const stub = env.SEARCH_INDEX.getByName("pypi");
    const res = await stub.fetch("https://do.local/ingest", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ records }),
    });

    const data = await res.json();
    log(`bootstrap_complete: ${JSON.stringify(data)}`);

    return res;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : "";
    log(`bootstrap_error: ${errorMsg}`);
    return new Response(`bootstrap failed: ${errorMsg}\n\nLogs:\n${logs.join("\n")}`, { status: 500 });
  }
}

const json = (o: unknown) =>
  new Response(JSON.stringify(o), {
    headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
  });
