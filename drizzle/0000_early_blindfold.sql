-- Current sql file was generated after introspecting the database
-- If you want to run this migration please uncomment this code before executing migrations
/*
CREATE TABLE "packages" (
	"name" text PRIMARY KEY NOT NULL,
	"summary" text,
	"version" text,
	"home_page" text,
	"updated_at" bigint,
	"description" text,
	"author" text,
	"license" text,
	"classifiers" text[],
	"requires_python" text,
	"keywords" text,
	"downloads_4w" bigint,
	"normalized_name" text GENERATED ALWAYS AS (lower(regexp_replace(COALESCE(name, ''::text), '[-_.]+'::text, '-'::text, 'g'::text))) STORED,
	"import_names" text[],
	"search_tsv" "tsvector" GENERATED ALWAYS AS ((to_tsvector('simple'::regconfig, lower(regexp_replace(COALESCE(name, ''::text), '[-_.]+'::text, '-'::text, 'g'::text))) || to_tsvector('simple'::regconfig, import_names_to_text(import_names)))) STORED
);
--> statement-breakpoint
CREATE INDEX "idx_packages_name_lower_pattern" ON "packages" USING btree (lower(name) text_pattern_ops);--> statement-breakpoint
CREATE INDEX "idx_packages_name_lower_trgm" ON "packages" USING gin (lower(name) gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "idx_packages_normalized_name" ON "packages" USING btree ("normalized_name" text_ops);
*/