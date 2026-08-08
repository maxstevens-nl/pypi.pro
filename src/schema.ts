import { sql } from "drizzle-orm";
import { text, bigint, pgTable, index, customType } from "drizzle-orm/pg-core";

const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

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
    searchTsv: tsvector("search_tsv").generatedAlwaysAs(
      sql`setweight(to_tsvector('simple', coalesce(name, '')), 'A') || setweight(to_tsvector('english', coalesce(summary, '')), 'B') || setweight(to_tsvector('simple', coalesce(keywords, '')), 'C')`,
    ),
  },
  (t) => [
    index("idx_packages_name_lower_pattern").using(
      "btree",
      sql`lower(${t.name}) text_pattern_ops`,
    ),
    index("idx_packages_name_lower_trgm").using(
      "gin",
      sql`lower(${t.name}) gin_trgm_ops`,
    ),
    index("idx_packages_search_tsv").using("gin", t.searchTsv),
  ],
);

export type Package = typeof packages.$inferSelect;
export type NewPackage = typeof packages.$inferInsert;
