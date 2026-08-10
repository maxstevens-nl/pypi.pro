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

export const migrate = new local.Command(
  "MigrateDb",
  {
    create: "bun ./packages/api/migrate.ts",
    update: "bun ./packages/api/migrate.ts",
    dir: process.cwd(),
    environment: {
      DATABASE_URL: database.properties.connectionString,
      SST_STAGE: $app.stage,
    },
    triggers: [database.properties.connectionString, migrationsHash],
  },
  { dependsOn: [database] },
);
