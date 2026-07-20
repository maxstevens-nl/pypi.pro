import { sql } from "drizzle-orm";
import { integer, real, text, bigint, pgTable, index } from "drizzle-orm/pg-core";

export const packages = pgTable(
  "packages",
  {
    name: text("name").primaryKey(),
    displayName: text("display_name"),
    summary: text("summary"),
    version: text("version"),
    homePage: text("home_page"),
    updatedAt: bigint("updated_at", { mode: "number" }),
    downloads1w: bigint("downloads_1w", { mode: "number" }).default(0),
    downloads4w: bigint("downloads_4w", { mode: "number" }).default(0),
    trend: real("trend").default(0),
    downloads52w: integer("downloads_52w").array(),
  },
  (t) => ({
    downloadsIdx: index("idx_packages_downloads").on(t.downloads4w),
    nameTrgmIdx: index("idx_packages_name_trgm").using("gin", sql`${t.name} gin_trgm_ops`),
  })
);

export type Package = typeof packages.$inferSelect;
export type NewPackage = typeof packages.$inferInsert;