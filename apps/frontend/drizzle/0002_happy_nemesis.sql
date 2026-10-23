CREATE TABLE `editor_drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_hash` text NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `editor_drafts_owner_updated_idx` ON `editor_drafts` (`owner_hash`,`updated_at`);