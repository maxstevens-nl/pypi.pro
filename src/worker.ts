import { search } from "./search";
import { getNeonHttpDb, drizzleNodePg, type Db } from "./db";
import { Resource } from "sst";
import { Client } from "pg";

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const startTime = Date.now();
    const requestId = crypto.randomUUID();
    const url = new URL(req.url);

    console.log(
      JSON.stringify({
        level: "info",
        requestId,
        method: req.method,
        path: url.pathname,
        query: url.search,
        cfRay: req.headers.get("cf-ray"),
        country: req.headers.get("cf-ipcountry"),
      }),
    );

    try {
      let response: Response;

      if (url.pathname === "/api/search") {
        response = await handleSearch(env, ctx, url);
      } else if (env.ASSETS) {
        response = await env.ASSETS.fetch(req);
      } else {
        response = new Response("not found", { status: 404 });
      }

      const duration = Date.now() - startTime;
      console.log(
        JSON.stringify({
          level: "info",
          requestId,
          status: response.status,
          duration,
        }),
      );

      return response;
    } catch (error) {
      const duration = Date.now() - startTime;
      console.log(
        JSON.stringify({
          level: "error",
          requestId,
          error: error instanceof Error ? error.message : String(error),
          cause:
            error instanceof Error && error.cause instanceof Error
              ? error.cause.message
              : undefined,
          stack: error instanceof Error ? error.stack : undefined,
          duration,
        }),
      );
      return new Response("internal error", { status: 500 });
    }
  },
};

async function handleSearch(env: Env, ctx: ExecutionContext, url: URL): Promise<Response> {
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  if (!q) return json({ hits: [] });

  let db: Db;
  let cleanup: (() => Promise<void>) | null = null;

  if (Resource.Database) {
    const client = new Client({
      connectionString: Resource.Database.connectionString,
    });
    await client.connect();
    db = drizzleNodePg(client, { schema: await import("./schema") });
    cleanup = () => client.end();
  } else {
    db = getNeonHttpDb(env);
  }

  try {
    const result = await search(db, q);
    return new Response(JSON.stringify(result), {
      headers: {
        "content-type": "application/json",
        "access-control-allow-origin": "*",
      },
    });
  } finally {
    if (cleanup) ctx.waitUntil(cleanup());
  }
}

const json = (o: unknown) =>
  new Response(JSON.stringify(o), {
    headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
  });
