import { drizzle } from "drizzle-orm/d1";
import { search } from "./search";
import * as schema from "../db/schema";
import { D1Database } from "@cloudflare/workers-types";
import { Db } from "./db";

interface Env {
  Database: D1Database;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
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
        const db = drizzle(env.Database, { schema });
        response = await handleSearch(url, requestId, db);
      } else if (url.pathname.startsWith("/api/")) {
        response = new Response(JSON.stringify({ error: "not found" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        });
      } else if (url.pathname === "/search" || url.pathname.startsWith("/search/")) {
        response = Response.redirect(
          new URL(`/?${url.searchParams.toString()}`, url.origin).toString(),
          301,
        );
      }
      // else if (env.ASSETS) {
      //   response = await env.ASSETS.fetch(req);
      // }
      else {
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
          path: url.pathname,
          query: url.searchParams.get("q"),
          connection: "d1",
          ...errorDetails(error),
          duration,
        }),
      );
      return new Response(JSON.stringify({ error: "internal error", requestId }), {
        status: 500,
        headers: {
          "content-type": "application/json",
          "x-request-id": requestId,
        },
      });
    }
  },
};

async function handleSearch(url: URL, requestId: string, db: Db): Promise<Response> {
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();

  const headers = new Headers({
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "cache-control": "public, max-age=60, s-maxage=300, stale-while-revalidate=60",
  });

  if (!q) {
    headers.set("x-request-id", requestId);
    return new Response(JSON.stringify({ hits: [] }), { headers });
  }

  const result = await search(db, q);

  headers.set("x-request-id", requestId);
  return new Response(JSON.stringify(result), { headers });
}

function errorDetails(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) {
    return { errorMessage: String(error) };
  }

  return {
    errorName: error.name,
    errorMessage: error.message,
    errorStack: error.stack,
    cause:
      error.cause instanceof Error
        ? {
            name: error.cause.name,
            message: error.cause.message,
            stack: error.cause.stack,
          }
        : error.cause,
  };
}
