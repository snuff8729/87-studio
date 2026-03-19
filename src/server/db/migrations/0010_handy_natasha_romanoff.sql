PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_reference_images` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer,
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
INSERT INTO `__new_reference_images`("id", "project_id", "type", "file_path", "thumbnail_path", "processed_path", "encoded_vibe_path", "encoded_model", "strength", "information_extracted", "fidelity", "reference_mode", "sort_order", "enabled", "created_at", "updated_at") SELECT "id", "project_id", "type", "file_path", "thumbnail_path", "processed_path", "encoded_vibe_path", "encoded_model", "strength", "information_extracted", "fidelity", "reference_mode", "sort_order", "enabled", "created_at", "updated_at" FROM `reference_images`;--> statement-breakpoint
DROP TABLE `reference_images`;--> statement-breakpoint
ALTER TABLE `__new_reference_images` RENAME TO `reference_images`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `reference_images_project_id_idx` ON `reference_images` (`project_id`);--> statement-breakpoint
CREATE INDEX `reference_images_project_type_idx` ON `reference_images` (`project_id`,`type`);