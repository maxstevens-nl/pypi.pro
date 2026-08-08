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
    importNames: text("import_names").array(),
    searchTsv: tsvector("search_tsv").generatedAlwaysAs(
      sql`to_tsvector('simple', lower(regexp_replace(coalesce(name, ''), '[-_.]+', '-', 'g')))
          || to_tsvector('simple', import_names_to_text(import_names))`,
    ),
    normalizedName: text("normalized_name").generatedAlwaysAs(
      sql`lower(regexp_replace(coalesce(name, ''), '[-_.]+', '-', 'g'))`,
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
    index("idx_packages_normalized_name").using("btree", t.normalizedName),
    index("idx_packages_search_bm25")
      .using("lakebase_bm25", t.searchTsv)
      .with({ default_limit: 100 }),
  ],
);

export type Package = typeof packages.$inferSelect;
export type NewPackage = typeof packages.$inferInsert;
