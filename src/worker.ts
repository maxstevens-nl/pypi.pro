import { search } from "./search";
import { Resource } from "sst";
import { Client } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";

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
        response = await handleSearch(ctx, url);
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

async function handleSearch(ctx: ExecutionContext, url: URL): Promise<Response> {
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  if (!q) return json({ hits: [] });

  const client = new Client({
    connectionString: Resource.Database.connectionString,
  });
  await client.connect();
  const db = drizzle(client, { schema: await import("./schema") });

  const result = await search(db, q);

  ctx.waitUntil(client.end());

  return new Response(JSON.stringify(result), {
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "cache-control": "public, max-age=0, s-maxage=300, must-revalidate",
    },
  });
}

const json = (o: unknown) =>
  new Response(JSON.stringify(o), {
    headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
  });
