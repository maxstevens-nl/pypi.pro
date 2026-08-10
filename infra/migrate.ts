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

const drizzleConfigHash = createHash("sha256")
  .update(readFileSync("drizzle.config.ts", "utf8"))
  .digest("hex");

export const migrate = new local.Command(
  "MigrateDb",
  {
    create: "bun run db migrate",
    update: "bun run db migrate",
    dir: process.cwd(),
    triggers: [database, migrationsHash, drizzleConfigHash],
  },
  { dependsOn: [database] },
);
