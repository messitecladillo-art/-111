CREATE TABLE `editor_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`draft_id` text NOT NULL,
	`label` text NOT NULL,
	`source_revision` integer NOT NULL,
	`content` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`draft_id`) REFERENCES `editor_drafts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `editor_versions_draft_created_idx` ON `editor_versions` (`draft_id`,`created_at`);