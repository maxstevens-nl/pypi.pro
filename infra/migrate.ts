import { local } from "@pulumi/command";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { database } from "./database";

const migrationsHash = createHash("sha256")
  .update(
    readdirSync("drizzle")
      .filter((f) => f.endsWith(".sql"))
      .map((f) => readFileSync(`drizzle/${f}`, "utf8"))
      .join("\n---\n"),
  )
  .digest("hex");
const seedHash = createHash("sha256")
  .update(readFileSync("snapshot.ndjson"))
  .digest("hex");
const migrateCommand = $app.stage === "prod"
  ? "bun ./src/migrate.ts"
  : "bun ./src/migrate.ts && bun ./scripts/seed.ts";

export const migrate = new local.Command(
  "MigrateDb",
  {
    create: migrateCommand,
    update: migrateCommand,
    dir: process.cwd(),
    environment: {
      DATABASE_URL: database.properties.connectionString,
      SST_STAGE: $app.stage,
    },
    triggers: [database.properties.connectionString, migrationsHash, seedHash],
  },
  { dependsOn: [database] },
);
