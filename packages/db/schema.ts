import { sql, defineRelations } from "drizzle-orm";
import { text, integer, sqliteTable, index } from "drizzle-orm/sqlite-core";

export const packages = sqliteTable(
  "packages",
  {
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
    normalizedName: text("normalized_name"),
  },
  (t) => [
    index("idx_packages_name_lower_pattern").on(sql`lower(${t.name})`),
    index("idx_packages_normalized_name").on(t.normalizedName),
  ],
);

export const relations = defineRelations({ packages });
