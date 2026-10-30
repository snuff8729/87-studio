CREATE TABLE `tag_descriptions` (
	`tag` text NOT NULL,
	`locale` text NOT NULL,
	`text` text NOT NULL,
	`source` text,
	`updated_at` text DEFAULT (datetime('now')),
	PRIMARY KEY(`tag`, `locale`)
);
