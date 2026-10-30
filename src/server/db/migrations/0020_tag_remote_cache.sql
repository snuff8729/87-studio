CREATE TABLE `tag_remote_cache` (
	`tag` text NOT NULL,
	`kind` text NOT NULL,
	`json` text NOT NULL,
	`fetched_at` integer NOT NULL,
	PRIMARY KEY(`tag`, `kind`)
);
