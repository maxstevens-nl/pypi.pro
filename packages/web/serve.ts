import { join } from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const DATABASE_URL = Bun.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL is required");

const migrationsFolder = join(import.meta.dir, "../../drizzle");

const client = postgres(DATABASE_URL, { max: 1 });
await migrate(drizzle(client), { migrationsFolder });
await client.end();

const root = "./dist";

Bun.serve({
  async fetch(req) {
    const path = new URL(req.url).pathname;
    const file = Bun.file(root + path);
    return (await file.exists())
      ? new Response(file)
      : new Response(Bun.file(root + "/index.html"));
  },
  port: 3000,
});
