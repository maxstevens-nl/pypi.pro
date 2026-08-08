CREATE EXTENSION IF NOT EXISTS lakebase_text;--> statement-breakpoint
ALTER TABLE "packages" ADD COLUMN IF NOT EXISTS "search_tsv" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('simple', coalesce(name, '')), 'A') || setweight(to_tsvector('english', coalesce(summary, '')), 'B') || setweight(to_tsvector('simple', coalesce(keywords, '')), 'C')) STORED;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_packages_name_lower_pattern" ON "packages" USING btree (lower("name") text_pattern_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_packages_name_lower_trgm" ON "packages" USING gin (lower("name") gin_trgm_ops);--> statement-breakpoint
DROP INDEX IF EXISTS "idx_packages_search_tsv";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_packages_search_bm25" ON "packages" USING lakebase_bm25 ("search_tsv") WITH (default_limit=20);
