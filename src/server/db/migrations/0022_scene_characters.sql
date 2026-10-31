ALTER TABLE `character_scene_overrides` ADD `presence` text;--> statement-breakpoint
ALTER TABLE `character_scene_overrides` ADD `replace_prompt` text;--> statement-breakpoint
ALTER TABLE `character_scene_overrides` ADD `replace_negative` text;--> statement-breakpoint
ALTER TABLE `characters` ADD `appearance` text DEFAULT 'all' NOT NULL;