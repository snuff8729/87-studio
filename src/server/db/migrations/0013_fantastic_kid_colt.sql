CREATE TABLE `tag_bookmark_images` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`bookmark_id` integer NOT NULL,
	`source` text NOT NULL,
	`gallery_image_id` integer,
	`file_path` text NOT NULL,
	`thumbnail_path` text,
	`sort_order` integer DEFAULT 0,
	`created_at` text DEFAULT (datetime('now')),
	FOREIGN KEY (`bookmark_id`) REFERENCES `tag_bookmarks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tag_bookmark_images_bookmark_id_idx` ON `tag_bookmark_images` (`bookmark_id`);--> statement-breakpoint
CREATE TABLE `tag_bookmark_tag_assignments` (
	`bookmark_id` integer NOT NULL,
	`tag_id` integer NOT NULL,
	PRIMARY KEY(`bookmark_id`, `tag_id`),
	FOREIGN KEY (`bookmark_id`) REFERENCES `tag_bookmarks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tag_bookmark_tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tag_bookmark_tag_assignments_tag_id_idx` ON `tag_bookmark_tag_assignments` (`tag_id`);--> statement-breakpoint
CREATE TABLE `tag_bookmark_tags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tag_bookmark_tags_name_unique` ON `tag_bookmark_tags` (`name`);--> statement-breakpoint
CREATE TABLE `tag_bookmarks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`memo` text,
	`thumbnail_image_id` integer,
	`created_at` text DEFAULT (datetime('now')),
	`updated_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tag_bookmarks_name_unique` ON `tag_bookmarks` (`name`);