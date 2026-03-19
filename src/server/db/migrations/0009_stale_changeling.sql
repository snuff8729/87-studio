CREATE TABLE `reference_images` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`type` text NOT NULL,
	`file_path` text NOT NULL,
	`thumbnail_path` text,
	`processed_path` text,
	`encoded_vibe_path` text,
	`encoded_model` text,
	`strength` real DEFAULT 0.6 NOT NULL,
	`information_extracted` real DEFAULT 1 NOT NULL,
	`fidelity` real DEFAULT 1 NOT NULL,
	`reference_mode` text DEFAULT 'character&style' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT (datetime('now')),
	`updated_at` text DEFAULT (datetime('now')),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `reference_images_project_id_idx` ON `reference_images` (`project_id`);--> statement-breakpoint
CREATE INDEX `reference_images_project_type_idx` ON `reference_images` (`project_id`,`type`);