CREATE TABLE `image_bundles` (
	`image_id` integer NOT NULL,
	`bundle_id` integer NOT NULL,
	PRIMARY KEY(`image_id`, `bundle_id`),
	FOREIGN KEY (`image_id`) REFERENCES `generated_images`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`bundle_id`) REFERENCES `prompt_bundles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `image_bundles_bundle_id_idx` ON `image_bundles` (`bundle_id`);--> statement-breakpoint
CREATE TABLE `prompt_bundles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`content` text DEFAULT '' NOT NULL,
	`thumbnail_image_id` integer,
	`created_at` text DEFAULT (datetime('now')),
	`updated_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `prompt_bundles_name_unique` ON `prompt_bundles` (`name`);