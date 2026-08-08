DROP INDEX "idx_packages_downloads";--> statement-breakpoint
ALTER TABLE "packages" DROP COLUMN "downloads_1w";--> statement-breakpoint
ALTER TABLE "packages" DROP COLUMN "downloads_4w";--> statement-breakpoint
ALTER TABLE "packages" DROP COLUMN "downloads_52w";