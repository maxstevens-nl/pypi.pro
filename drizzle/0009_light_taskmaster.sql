DROP INDEX IF EXISTS "idx_packages_search_bm25";--> statement-breakpoint
ALTER TABLE "packages" DROP COLUMN IF EXISTS "search_tsv";--> statement-breakpoint
ALTER TABLE "packages" ADD COLUMN IF NOT EXISTS "search_tsv" "tsvector" GENERATED ALWAYS AS (to_tsvector('simple', lower(regexp_replace(coalesce(name, ''), '[-_.]+', '-', 'g')))) STORED;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_packages_search_bm25" ON "packages" USING lakebase_bm25 ("search_tsv") WITH (default_limit=100);
