CREATE TABLE IF NOT EXISTS "packages" (
	"name" text PRIMARY KEY NOT NULL,
	"display_name" text,
	"summary" text,
	"version" text,
	"home_page" text,
	"updated_at" bigint,
	"downloads_1w" bigint DEFAULT 0,
	"downloads_4w" bigint DEFAULT 0,
	"trend" real DEFAULT 0,
	"downloads_52w" integer[]
);
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_packages_downloads" ON "packages" USING btree ("downloads_4w");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_packages_name_trgm" ON "packages" USING gin ("name" gin_trgm_ops);
