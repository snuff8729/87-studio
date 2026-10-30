CREATE TABLE `image_axis_values` (
	`image_id` integer NOT NULL,
	`axis_id` integer NOT NULL,
	`value_id` integer NOT NULL,
	PRIMARY KEY(`image_id`, `axis_id`, `value_id`),
	FOREIGN KEY (`image_id`) REFERENCES `generated_images`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`axis_id`) REFERENCES `library_axes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`value_id`) REFERENCES `library_axis_values`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `image_axis_values_axis_value_idx` ON `image_axis_values` (`axis_id`,`value_id`);--> statement-breakpoint
CREATE TABLE `image_library_links` (
	`image_id` integer NOT NULL,
	`kind` text NOT NULL,
	`ref_id` integer NOT NULL,
	PRIMARY KEY(`image_id`, `kind`, `ref_id`),
	FOREIGN KEY (`image_id`) REFERENCES `generated_images`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `image_library_links_ref_idx` ON `image_library_links` (`kind`,`ref_id`);--> statement-breakpoint
CREATE TABLE `library_areas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer DEFAULT 0
);
--> statement-breakpoint
ALTER TABLE `outfit_items` ADD `area_ids` text DEFAULT '[]';--> statement-breakpoint
ALTER TABLE `outfit_items` ADD `cover_rules` text DEFAULT '[]';
--> statement-breakpoint
INSERT INTO `library_areas` (`name`, `sort_order`) VALUES ('Top', 0), ('Bottom', 1), ('Outerwear', 2), ('Shoes', 3), ('Headwear', 4), ('Accessory', 5);
