import { search } from "./search";
import { Resource } from "sst";
import { Client } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Db } from "./db";

let connection: { client: Client; db: Db } | undefined;
let connecting: Promise<Db> | undefined;

export default {
  async fetch(req: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
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
        response = await handleSearch(url);
      } else if (url.pathname === "/search" || url.pathname.startsWith("/search/")) {
        response = Response.redirect(
          new URL(`/?${url.searchParams.toString()}`, url.origin).toString(),
          301,
        );
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

async function handleSearch(url: URL): Promise<Response> {
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  let result = { hits: [] as SearchResult["hits"] };

  if (q) {
    try {
      result = await runSearch(q);
    } catch (error) {
      console.log(
        JSON.stringify({
          level: "error",
          event: "search_query_failed",
          query: q,
          error: error instanceof Error ? error.message : String(error),
          cause:
            error instanceof Error && error.cause instanceof Error
              ? error.cause.message
              : undefined,
        }),
      );
      resetConnection();
      result = await runSearch(q);
    }
  }

  return new Response(JSON.stringify(result), {
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "cache-control": "public, max-age=60, s-maxage=300, stale-while-revalidate=60",
    },
  });
}

async function getDb(): Promise<Db> {
  if (connection) return connection.db;
  if (!connecting) {
    const client = new Client({
      connectionString: Resource.Database.connectionString,
    });
    connecting = client
      .connect()
      .then(async () => {
        const db = drizzle(client, { schema: await import("./schema") });
        connection = { client, db };
        return db;
      })
      .catch((error) => {
        connecting = undefined;
        throw error;
      });
  }
  return connecting;
}

async function runSearch(q: string): Promise<SearchResult> {
  return search(await getDb(), q);
}

function resetConnection() {
  const client = connection?.client;
  connection = undefined;
  connecting = undefined;
  if (client) void client.end().catch(() => undefined);
}

type SearchResult = Awaited<ReturnType<typeof search>>;
