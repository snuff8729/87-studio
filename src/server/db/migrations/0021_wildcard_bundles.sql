ALTER TABLE `prompt_bundles` ADD `kind` text DEFAULT 'text' NOT NULL;--> statement-breakpoint
ALTER TABLE `prompt_bundles` ADD `wildcard_mode` text DEFAULT 'random' NOT NULL;