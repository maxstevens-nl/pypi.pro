ALTER TABLE "packages" ADD COLUMN "metadata_version" text;--> statement-breakpoint
ALTER TABLE "packages" ADD COLUMN "download_url" text;--> statement-breakpoint
ALTER TABLE "packages" ADD COLUMN "platform" text;--> statement-breakpoint
ALTER TABLE "packages" ADD COLUMN "author_email" text;--> statement-breakpoint
ALTER TABLE "packages" ADD COLUMN "maintainer" text;--> statement-breakpoint
ALTER TABLE "packages" ADD COLUMN "maintainer_email" text;--> statement-breakpoint
ALTER TABLE "packages" ADD COLUMN "license_expression" text;--> statement-breakpoint
ALTER TABLE "packages" ADD COLUMN "license_files" text[];--> statement-breakpoint
ALTER TABLE "packages" ADD COLUMN "requires_dist" text[];--> statement-breakpoint
ALTER TABLE "packages" ADD COLUMN "provides_dist" text[];--> statement-breakpoint
ALTER TABLE "packages" ADD COLUMN "obsoletes_dist" text[];--> statement-breakpoint
ALTER TABLE "packages" ADD COLUMN "requires_external" text[];--> statement-breakpoint
ALTER TABLE "packages" ADD COLUMN "requires" text[];--> statement-breakpoint
ALTER TABLE "packages" ADD COLUMN "provides" text[];--> statement-breakpoint
ALTER TABLE "packages" ADD COLUMN "obsoletes" text[];--> statement-breakpoint
ALTER TABLE "packages" ADD COLUMN "project_urls" text[];