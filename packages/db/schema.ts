import { sql } from "drizzle-orm";
import { text, pgTable, index, bigint } from "drizzle-orm/pg-core";

export const packages = pgTable(
  "packages",
  {
    name: text("name").primaryKey(),
    summary: text("summary"),
    description: text("description"),
    author: text("author"),
    license: text("license"),
    classifiers: text("classifiers").array(),
    requiresPython: text("requires_python"),
    keywords: text("keywords"),
    version: text("version"),
    homePage: text("home_page"),
    updatedAt: bigint("updated_at", { mode: "number" }),
    downloads4w: bigint("downloads_4w", { mode: "number" }),
    importNames: text("import_names").array(),
    normalizedName: text("normalized_name"),
  },
  (t) => [
    index("idx_packages_name_lower_pattern").on(sql`lower(${t.name})`),
    index("idx_packages_normalized_name").on(t.normalizedName),
  ],
);

export type Package = typeof packages.$inferSelect;
export type NewPackage = typeof packages.$inferInsert;
