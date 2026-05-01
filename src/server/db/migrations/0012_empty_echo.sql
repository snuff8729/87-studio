CREATE TABLE `bundle_tag_assignments` (
	`bundle_id` integer NOT NULL,
	`tag_id` integer NOT NULL,
	PRIMARY KEY(`bundle_id`, `tag_id`),
	FOREIGN KEY (`bundle_id`) REFERENCES `prompt_bundles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `bundle_tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `bundle_tag_assignments_tag_id_idx` ON `bundle_tag_assignments` (`tag_id`);--> statement-breakpoint
CREATE TABLE `bundle_tags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bundle_tags_name_unique` ON `bundle_tags` (`name`);