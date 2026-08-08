import { sql } from "drizzle-orm";
import { integer, text, bigint, pgTable, index } from "drizzle-orm/pg-core";

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
    downloads1w: bigint("downloads_1w", { mode: "number" }),
    downloads4w: bigint("downloads_4w", { mode: "number" }),
    downloads52w: integer("downloads_52w").array(),
  },
  (t) => [
    index("idx_packages_downloads").on(t.downloads4w),
    index("idx_packages_name_trgm").using("gin", sql`${t.name} gin_trgm_ops`),
  ],
);

export type Package = typeof packages.$inferSelect;
export type NewPackage = typeof packages.$inferInsert;
