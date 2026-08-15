import { pgTable, text, bigint, integer } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const packages = pgTable("packages", {
  name: text().primaryKey().notNull(),
  metadataVersion: text("metadata_version"),
  summary: text(),
  version: text(),
  homePage: text("home_page"),
  downloadUrl: text("download_url"),
  platform: text(),
  updatedAt: bigint("updated_at", { mode: "number" }),
  description: text(),
  descriptionContentType: text("description_content_type"),
  author: text(),
  authorEmail: text("author_email"),
  maintainer: text(),
  maintainerEmail: text("maintainer_email"),
  license: text(),
  licenseExpression: text("license_expression"),
  licenseFiles: text("license_files").array(),
  classifiers: text().array(),
  requiresPython: text("requires_python"),
  requiresDist: text("requires_dist").array(),
  providesDist: text("provides_dist").array(),
  obsoletesDist: text("obsoletes_dist").array(),
  requiresExternal: text("requires_external").array(),
  requires: text("requires").array(),
  provides: text("provides").array(),
  obsoletes: text("obsoletes").array(),
  projectUrls: text("project_urls").array(),
  keywords: text(),
  downloads4W: bigint("downloads_4w", { mode: "number" }),
  normalizedName: text("normalized_name").generatedAlwaysAs(
    sql`lower(regexp_replace(COALESCE(name, ''::text), '[-_.]+'::text, '-'::text, 'g'::text))`,
  ),
  importNames: text("import_names").array(),
});

export const lastSync = pgTable("last_sync", {
  service: text().primaryKey().notNull(),
  lastSync: integer("last_sync").notNull(),
});
