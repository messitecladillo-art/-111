ALTER TABLE `project_events` ADD `payload` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `project_events` ADD `status_revision` integer;--> statement-breakpoint
ALTER TABLE `project_events` ADD `workflow_version` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `competition_stage` text DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `status_revision` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `workflow_version` text DEFAULT '1.0.0' NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `workflow_sha256` text DEFAULT '77098792eae338fd1bd57879dd76d2792abc641b474d38888f67bebf0e061da7' NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `gates_version` text DEFAULT '1.0.0' NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `gates_sha256` text DEFAULT '1b4a9e00afd2857c9126a8fa5f730c100deca24a5b126c9df2718fa756c00bd8' NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `authority` text DEFAULT 'legacy_unverified' NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `integrity` text DEFAULT 'needs_revalidation' NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `legacy_stage` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `legacy_gate_status` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `migrated_at` text;--> statement-breakpoint
UPDATE `projects`
SET
	`legacy_stage` = `stage`,
	`legacy_gate_status` = `gate_status`,
	`stage` = 'intake',
	`competition_stage` = 'unknown',
	`gate_status` = '{"rule":"not_run","problem":"not_run","design":"not_run","fieldwork":"not_run","data":"not_run","inference":"not_run","action":"not_run","visual":"not_run","submission":"not_run"}',
	`status_revision` = 0,
	`workflow_version` = '1.0.0',
	`workflow_sha256` = '77098792eae338fd1bd57879dd76d2792abc641b474d38888f67bebf0e061da7',
	`gates_version` = '1.0.0',
	`gates_sha256` = '1b4a9e00afd2857c9126a8fa5f730c100deca24a5b126c9df2718fa756c00bd8',
	`authority` = 'legacy_unverified',
	`integrity` = 'needs_revalidation',
	`migrated_at` = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE
	`authority` = 'legacy_unverified'
	AND `integrity` = 'needs_revalidation'
	AND `legacy_stage` IS NULL
	AND `legacy_gate_status` IS NULL
	AND `migrated_at` IS NULL;--> statement-breakpoint
INSERT INTO `project_events` (
	`project_id`,
	`event_type`,
	`stage_from`,
	`stage_to`,
	`payload`,
	`status_revision`,
	`workflow_version`,
	`created_at`
)
SELECT
	p.`id`,
	'legacy_web_v1_migrated_to_canonical_v1',
	p.`legacy_stage`,
	'intake',
	'{"mapping":"none","authority":"legacy_unverified","integrity":"needs_revalidation"}',
	0,
	'1.0.0',
	p.`migrated_at`
FROM `projects` p
WHERE p.`migrated_at` IS NOT NULL
	AND NOT EXISTS (
		SELECT 1
		FROM `project_events` e
		WHERE e.`project_id` = p.`id`
			AND e.`event_type` = 'legacy_web_v1_migrated_to_canonical_v1'
	);
