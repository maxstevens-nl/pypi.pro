import { Pool } from "@neondatabase/serverless";

export type Db = Pool;

export function createDb(connectionString: string): Db {
  return new Pool({
    connectionString,
    max: 10,
    connectionTimeoutMillis: 30_000,
  });
}

export function getDb(env: Env): Db {
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured");
  }
  return createDb(env.DATABASE_URL);
}