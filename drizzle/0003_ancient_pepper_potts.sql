DROP INDEX "idx_packages_name_trgm";--> statement-breakpoint
CREATE INDEX "idx_packages_name_lower_pattern" ON "packages" USING btree (lower("name") text_pattern_ops);--> statement-breakpoint
CREATE INDEX "idx_packages_name_lower_trgm" ON "packages" USING gin (lower("name") gin_trgm_ops);
