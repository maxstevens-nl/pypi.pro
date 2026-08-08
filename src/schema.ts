import { sql } from "drizzle-orm";
import { text, bigint, pgTable, index } from "drizzle-orm/pg-core";

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
  ],
);

export type Package = typeof packages.$inferSelect;
export type NewPackage = typeof packages.$inferInsert;
