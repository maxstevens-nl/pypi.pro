CREATE TABLE "last_sync" (
	"service" text PRIMARY KEY NOT NULL,
	"last_sync" integer NOT NULL
);
--> statement-breakpoint
DROP INDEX "idx_packages_name_lower_pattern";--> statement-breakpoint
DROP INDEX "idx_packages_name_lower_trgm";--> statement-breakpoint
DROP INDEX "idx_packages_normalized_name";--> statement-breakpoint
ALTER TABLE "packages" DROP COLUMN "search_tsv";