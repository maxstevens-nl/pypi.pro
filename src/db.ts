import { drizzle as drizzleNeonHttp } from "drizzle-orm/neon-http";
import { drizzle as drizzleNodePg } from "drizzle-orm/node-postgres";
import { neon, neonConfig } from "@neondatabase/serverless";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

export type Db =
  | NeonHttpDatabase<typeof schema>
  | NodePgDatabase<typeof schema>;

const LOCAL_PROXY_HOST = "db.localtest.me";
const LOCAL_PROXY_PORT = 4444;

// Local dev path: neon-http driver hits the local Neon HTTP proxy on :4444
// (or real Neon over HTTPS). Stateless — no client to close.
export function getNeonHttpDb(env: Env): Db {
  if (!env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is not set. Local dev requires DATABASE_URL " +
        "pointing at the Neon HTTP proxy on db.localtest.me.",
    );
  }
  const url = new URL(env.DATABASE_URL);
  if (url.hostname === LOCAL_PROXY_HOST) {
    neonConfig.fetchEndpoint = (host) =>
      host === LOCAL_PROXY_HOST
        ? `http://${host}:${LOCAL_PROXY_PORT}/sql`
        : `https://${host}/sql`;
  }
  const sqlClient = neon(env.DATABASE_URL);
  return drizzleNeonHttp({ client: sqlClient, schema });
}

// Drizzle wrapper around a freshly connected pg.Client pointing at Hyperdrive.
// Caller MUST close the client via `ctx.waitUntil(client.end())`.
export { drizzleNodePg };