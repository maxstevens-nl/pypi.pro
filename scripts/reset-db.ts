import { neon } from "@neondatabase/serverless";
import { Resource } from "sst";
import { $ } from "bun";

const connectionString = process.env.DATABASE_URL ?? Resource.NeonDatabase.connectionString;

async function main() {
  console.log("Resetting database...");
  const sql = neon(connectionString);

  console.log("Dropping public schema...");
  await sql`DROP SCHEMA IF EXISTS public CASCADE`;

  console.log("Creating public schema...");
  await sql`CREATE SCHEMA public`;

  console.log("Running migrations...");
  await $`bun ./src/migrate.ts`.env({ DATABASE_URL: connectionString });

  console.log("Database reset complete.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
