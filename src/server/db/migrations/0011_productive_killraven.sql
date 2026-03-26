CREATE TABLE `generation_batches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer,
	`label` text NOT NULL,
	`queue_order` integer NOT NULL,
	`status` text DEFAULT 'pending',
	`created_at` text DEFAULT (datetime('now')),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `generation_batches_status_order_idx` ON `generation_batches` (`status`,`queue_order`);--> statement-breakpoint
ALTER TABLE `generation_jobs` ADD `batch_id` integer REFERENCES generation_batches(id);--> statement-breakpoint
ALTER TABLE `generation_jobs` ADD `queue_order` integer DEFAULT 0;--> statement-breakpoint
CREATE INDEX `generation_jobs_batch_order_idx` ON `generation_jobs` (`batch_id`,`queue_order`);