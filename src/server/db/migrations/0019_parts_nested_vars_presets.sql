ALTER TABLE `fragments` ADD `area_ids` text DEFAULT '[]';--> statement-breakpoint
ALTER TABLE `library_areas` ADD `parent_id` integer REFERENCES library_areas(id) ON UPDATE no action ON DELETE set null;--> statement-breakpoint
ALTER TABLE `outfit_items` ADD `variables` text DEFAULT '[]';--> statement-breakpoint
ALTER TABLE `outfit_presets` ADD `thumbnail_image_id` integer;
--> statement-breakpoint
INSERT INTO `library_areas` (`name`, `parent_id`, `sort_order`)
SELECT n.name, (SELECT id FROM `library_areas` WHERE `name` = 'Top' LIMIT 1), n.so
FROM (SELECT 'Neck' AS name, 100 AS so UNION ALL SELECT 'Chest', 101 UNION ALL SELECT 'Arms', 102) n
WHERE EXISTS (SELECT 1 FROM `library_areas` WHERE `name` = 'Top')
  AND NOT EXISTS (SELECT 1 FROM `library_areas` WHERE `name` IN ('Neck', 'Chest', 'Arms'));
