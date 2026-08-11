import { pgTable, text, bigint } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const packages = pgTable("packages", {
  name: text().primaryKey().notNull(),
  summary: text(),
  version: text(),
  homePage: text("home_page"),
  updatedAt: bigint("updated_at", { mode: "number" }),
  description: text(),
  author: text(),
  license: text(),
  classifiers: text().array(),
  requiresPython: text("requires_python"),
  keywords: text(),
  downloads4W: bigint("downloads_4w", { mode: "number" }),
  normalizedName: text("normalized_name").generatedAlwaysAs(
    sql`lower(regexp_replace(COALESCE(name, ''::text), '[-_.]+'::text, '-'::text, 'g'::text))`,
  ),
  importNames: text("import_names").array(),
});
