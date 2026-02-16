CREATE TABLE `tournament_matches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_scene_id` integer NOT NULL,
	`image1_id` integer NOT NULL,
	`image2_id` integer NOT NULL,
	`result` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')),
	FOREIGN KEY (`project_scene_id`) REFERENCES `project_scenes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`image1_id`) REFERENCES `generated_images`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`image2_id`) REFERENCES `generated_images`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tournament_matches_scene_idx` ON `tournament_matches` (`project_scene_id`);--> statement-breakpoint
CREATE INDEX `tournament_matches_image1_idx` ON `tournament_matches` (`image1_id`);--> statement-breakpoint
CREATE INDEX `tournament_matches_image2_idx` ON `tournament_matches` (`image2_id`);--> statement-breakpoint
ALTER TABLE `generated_images` ADD `tournament_wins` integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE `generated_images` ADD `tournament_losses` integer DEFAULT 0;