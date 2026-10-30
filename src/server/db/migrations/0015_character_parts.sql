CREATE TABLE `fragments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`character_id` integer,
	`item_id` integer,
	`text` text DEFAULT '',
	`conditions` text DEFAULT '{}',
	`sort_order` integer DEFAULT 0,
	`created_at` text DEFAULT (datetime('now')),
	`updated_at` text DEFAULT (datetime('now')),
	FOREIGN KEY (`character_id`) REFERENCES `library_characters`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`item_id`) REFERENCES `outfit_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `fragments_character_idx` ON `fragments` (`character_id`);--> statement-breakpoint
CREATE INDEX `fragments_item_idx` ON `fragments` (`item_id`);--> statement-breakpoint
CREATE TABLE `library_axes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`owner_character_id` integer,
	`owner_item_id` integer,
	`sort_order` integer DEFAULT 0,
	FOREIGN KEY (`owner_character_id`) REFERENCES `library_characters`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`owner_item_id`) REFERENCES `outfit_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `library_axes_owner_char_idx` ON `library_axes` (`owner_character_id`);--> statement-breakpoint
CREATE INDEX `library_axes_owner_item_idx` ON `library_axes` (`owner_item_id`);--> statement-breakpoint
CREATE TABLE `library_axis_values` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`axis_id` integer NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer DEFAULT 0,
	FOREIGN KEY (`axis_id`) REFERENCES `library_axes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `library_axis_values_axis_idx` ON `library_axis_values` (`axis_id`);--> statement-breakpoint
CREATE TABLE `library_characters` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`project_id` integer,
	`source_id` integer,
	`thumbnail_image_id` integer,
	`sort_order` integer DEFAULT 0,
	`created_at` text DEFAULT (datetime('now')),
	`updated_at` text DEFAULT (datetime('now')),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `library_characters_project_id_idx` ON `library_characters` (`project_id`);--> statement-breakpoint
CREATE TABLE `outfit_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`project_id` integer,
	`source_id` integer,
	`thumbnail_image_id` integer,
	`conditions` text DEFAULT '{}',
	`sort_order` integer DEFAULT 0,
	`created_at` text DEFAULT (datetime('now')),
	`updated_at` text DEFAULT (datetime('now')),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `outfit_items_project_id_idx` ON `outfit_items` (`project_id`);--> statement-breakpoint
CREATE TABLE `outfit_presets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`item_ids` text DEFAULT '[]',
	`sort_order` integer DEFAULT 0,
	`created_at` text DEFAULT (datetime('now')),
	`updated_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
ALTER TABLE `character_scene_overrides` ADD `axis_values` text DEFAULT '{}';--> statement-breakpoint
ALTER TABLE `character_scene_overrides` ADD `outfit_item_ids` text;--> statement-breakpoint
ALTER TABLE `characters` ADD `library_character_id` integer REFERENCES library_characters(id) ON DELETE set null;--> statement-breakpoint
ALTER TABLE `characters` ADD `outfit_item_ids` text DEFAULT '[]';--> statement-breakpoint
ALTER TABLE `characters` ADD `axis_values` text DEFAULT '{}';--> statement-breakpoint
ALTER TABLE `project_scenes` ADD `axis_values` text DEFAULT '{}';--> statement-breakpoint
ALTER TABLE `scenes` ADD `axis_values` text DEFAULT '{}';--> statement-breakpoint
INSERT INTO `library_axes` (`name`, `sort_order`) VALUES ('View', 0);--> statement-breakpoint
INSERT INTO `library_axis_values` (`axis_id`, `name`, `sort_order`) SELECT (SELECT max(`id`) FROM `library_axes`), 'Front', 0;--> statement-breakpoint
INSERT INTO `library_axis_values` (`axis_id`, `name`, `sort_order`) SELECT (SELECT max(`id`) FROM `library_axes`), 'Side', 1;--> statement-breakpoint
INSERT INTO `library_axis_values` (`axis_id`, `name`, `sort_order`) SELECT (SELECT max(`id`) FROM `library_axes`), 'Back', 2;--> statement-breakpoint
INSERT INTO `library_axes` (`name`, `sort_order`) VALUES ('Framing', 1);--> statement-breakpoint
INSERT INTO `library_axis_values` (`axis_id`, `name`, `sort_order`) SELECT (SELECT max(`id`) FROM `library_axes`), 'Full body', 0;--> statement-breakpoint
INSERT INTO `library_axis_values` (`axis_id`, `name`, `sort_order`) SELECT (SELECT max(`id`) FROM `library_axes`), 'Upper body', 1;--> statement-breakpoint
INSERT INTO `library_axis_values` (`axis_id`, `name`, `sort_order`) SELECT (SELECT max(`id`) FROM `library_axes`), 'Face', 2;
