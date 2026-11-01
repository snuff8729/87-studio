ALTER TABLE `prompt_bundles` ADD `negative` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `prompt_bundles` ADD `style_params` text;--> statement-breakpoint
ALTER TABLE `prompt_bundles` ADD `preview_path` text;