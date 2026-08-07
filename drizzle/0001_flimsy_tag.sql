ALTER TABLE "packages" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "packages" ADD COLUMN "author" text;--> statement-breakpoint
ALTER TABLE "packages" ADD COLUMN "license" text;--> statement-breakpoint
ALTER TABLE "packages" ADD COLUMN "classifiers" text[];--> statement-breakpoint
ALTER TABLE "packages" ADD COLUMN "requires_python" text;--> statement-breakpoint
ALTER TABLE "packages" ADD COLUMN "keywords" text;