PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_generated_images` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`job_id` integer NOT NULL,
	`project_id` integer,
	`project_scene_id` integer,
	`source_scene_id` integer,
	`file_path` text NOT NULL,
	`thumbnail_path` text,
	`seed` integer,
	`metadata` text DEFAULT '{}',
	`is_favorite` integer DEFAULT 0,
	`rating` integer,
	`memo` text,
	`tournament_wins` integer DEFAULT 0,
	`tournament_losses` integer DEFAULT 0,
	`created_at` text DEFAULT (datetime('now')),
	FOREIGN KEY (`job_id`) REFERENCES `generation_jobs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_scene_id`) REFERENCES `project_scenes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_scene_id`) REFERENCES `scenes`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_generated_images`("id", "job_id", "project_id", "project_scene_id", "source_scene_id", "file_path", "thumbnail_path", "seed", "metadata", "is_favorite", "rating", "memo", "tournament_wins", "tournament_losses", "created_at") SELECT "id", "job_id", "project_id", "project_scene_id", "source_scene_id", "file_path", "thumbnail_path", "seed", "metadata", "is_favorite", "rating", "memo", "tournament_wins", "tournament_losses", "created_at" FROM `generated_images`;--> statement-breakpoint
DROP TABLE `generated_images`;--> statement-breakpoint
ALTER TABLE `__new_generated_images` RENAME TO `generated_images`;--> statement-breakpoint
CREATE INDEX `generated_images_project_id_idx` ON `generated_images` (`project_id`);--> statement-breakpoint
CREATE INDEX `generated_images_scene_id_idx` ON `generated_images` (`project_scene_id`);--> statement-breakpoint
CREATE INDEX `generated_images_source_scene_idx` ON `generated_images` (`source_scene_id`);--> statement-breakpoint
CREATE INDEX `generated_images_favorite_idx` ON `generated_images` (`is_favorite`);--> statement-breakpoint
CREATE INDEX `generated_images_job_id_idx` ON `generated_images` (`job_id`);--> statement-breakpoint
CREATE INDEX `generated_images_project_created_idx` ON `generated_images` (`project_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `generated_images_favorite_created_idx` ON `generated_images` (`is_favorite`,`created_at`);--> statement-breakpoint
CREATE TABLE `__new_generation_jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer,
	`project_scene_id` integer,
	`source_scene_id` integer,
	`resolved_prompts` text NOT NULL,
	`resolved_parameters` text NOT NULL,
	`total_count` integer DEFAULT 1,
	`completed_count` integer DEFAULT 0,
	`status` text DEFAULT 'pending',
	`error_message` text,
	`created_at` text DEFAULT (datetime('now')),
	`updated_at` text DEFAULT (datetime('now')),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_scene_id`) REFERENCES `project_scenes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_scene_id`) REFERENCES `scenes`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_generation_jobs`("id", "project_id", "project_scene_id", "source_scene_id", "resolved_prompts", "resolved_parameters", "total_count", "completed_count", "status", "error_message", "created_at", "updated_at") SELECT "id", "project_id", "project_scene_id", "source_scene_id", "resolved_prompts", "resolved_parameters", "total_count", "completed_count", "status", "error_message", "created_at", "updated_at" FROM `generation_jobs`;--> statement-breakpoint
DROP TABLE `generation_jobs`;--> statement-breakpoint
ALTER TABLE `__new_generation_jobs` RENAME TO `generation_jobs`;--> statement-breakpoint
CREATE INDEX `generation_jobs_status_idx` ON `generation_jobs` (`status`);--> statement-breakpoint
CREATE INDEX `generation_jobs_project_id_idx` ON `generation_jobs` (`project_id`);--> statement-breakpoint
CREATE INDEX `generation_jobs_scene_id_idx` ON `generation_jobs` (`project_scene_id`);--> statement-breakpoint
PRAGMA foreign_keys=ON;