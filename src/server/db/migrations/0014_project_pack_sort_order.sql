ALTER TABLE `project_scene_packs` ADD `sort_order` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE `project_scene_packs` SET `sort_order` = (SELECT COUNT(*) FROM `project_scene_packs` AS `p2` WHERE `p2`.`project_id` = `project_scene_packs`.`project_id` AND `p2`.`id` < `project_scene_packs`.`id`);
