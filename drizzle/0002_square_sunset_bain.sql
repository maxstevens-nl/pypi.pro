ALTER TABLE "packages" ALTER COLUMN "downloads_1w" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "packages" ALTER COLUMN "downloads_4w" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "packages" DROP COLUMN "display_name";--> statement-breakpoint
ALTER TABLE "packages" DROP COLUMN "trend";