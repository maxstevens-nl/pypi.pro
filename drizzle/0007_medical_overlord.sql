CREATE EXTENSION IF NOT EXISTS unaccent;--> statement-breakpoint
ALTER INDEX "idx_packages_search_bm25" SET (default_limit=100);
