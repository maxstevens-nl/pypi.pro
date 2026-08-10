import { sql } from "drizzle-orm";
import { text, integer, sqliteTable, index, customType } from "drizzle-orm/sqlite-core";

export const packages = sqliteTable("packages", {
  name: text("name").primaryKey(),
  summary: text("summary"),
  description: text("description"),
  author: text("author"),
  license: text("license"),
  classifiers: text("classifiers", { mode: "json" }).$type<string[]>(),
  requiresPython: text("requires_python"),
  keywords: text("keywords"),
  version: text("version"),
  homePage: text("home_page"),
  updatedAt: integer("updated_at", { mode: "number" }),
  downloads4w: integer("downloads_4w", { mode: "number" }),
  importNames: text("import_names", { mode: "json" }).$type<string[]>(),
  normalizedName: text("normalized_name").generatedAlwaysAs(
    sql`lower(regexp_replace(coalesce(name, ''), '[-_.]+', '-', 'g'))`,
  ),
});

export type Package = typeof packages.$inferSelect;
export type NewPackage = typeof packages.$inferInsert;
