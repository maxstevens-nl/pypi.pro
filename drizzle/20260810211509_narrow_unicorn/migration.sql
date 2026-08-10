CREATE TABLE `packages` (
	`name` text PRIMARY KEY,
	`summary` text,
	`description` text,
	`author` text,
	`license` text,
	`classifiers` text,
	`requires_python` text,
	`keywords` text,
	`version` text,
	`home_page` text,
	`updated_at` integer,
	`downloads_4w` integer,
	`import_names` text,
	`normalized_name` text
);
--> statement-breakpoint
CREATE INDEX `idx_packages_name_lower_pattern` ON `packages` (lower("name"));--> statement-breakpoint
CREATE INDEX `idx_packages_normalized_name` ON `packages` (`normalized_name`);