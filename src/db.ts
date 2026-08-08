import { drizzle as drizzleNeonHttp } from "drizzle-orm/neon-http";
import { drizzle as drizzleNodePg } from "drizzle-orm/node-postgres";
import { neon } from "@neondatabase/serverless";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

export type Db = NeonHttpDatabase<typeof schema> | NodePgDatabase<typeof schema>;

// neon-http driver hitting real Neon over HTTPS. Stateless — no client to close.
export function getNeonHttpDb(env: Env): Db {
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set. SST injects it via infra/api.ts.");
  }
  const sqlClient = neon(env.DATABASE_URL);
  return drizzleNeonHttp({ client: sqlClient, schema });
}

// Drizzle wrapper around a freshly connected pg.Client pointing at Hyperdrive.
// Caller MUST close the client via `ctx.waitUntil(client.end())`.
export { drizzleNodePg };
