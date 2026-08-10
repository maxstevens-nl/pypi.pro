import { Resource } from "sst";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./drizzle",
  schema: "./packages/db/schema.ts",
  dialect: "sqlite",
  driver: "d1-http",
  dbCredentials: {
    accountId: Resource.Database.accountId,
    databaseId: Resource.Database.databaseId,
    token: Resource.Database.token,
  },
});
