CREATE TABLE `research_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_hash` text NOT NULL,
	`draft_id` text NOT NULL,
	`base_revision` integer NOT NULL,
	`input` text NOT NULL,
	`input_hash` text NOT NULL,
	`proposal` text NOT NULL,
	`proposal_hash` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`before_id` text NOT NULL,
	`version_id` text NOT NULL,
	`commit_token` text,
	`accepted_revision` integer,
	`before_receipt_id` text,
	`after_receipt_id` text,
	`created_at` text NOT NULL,
	`decided_at` text,
	FOREIGN KEY (`draft_id`) REFERENCES `editor_drafts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`before_receipt_id`) REFERENCES `editor_versions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`after_receipt_id`) REFERENCES `editor_versions`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "research_runs_state_check" CHECK("research_runs"."status" IN ('pending','accepting','accepted','cancelled')),
	CONSTRAINT "research_runs_revision_check" CHECK("research_runs"."base_revision" >= 1),
	CONSTRAINT "research_runs_receipt_check" CHECK("research_runs"."status" != 'accepted' OR ("research_runs"."accepted_revision" IS NOT NULL AND "research_runs"."accepted_revision" = "research_runs"."base_revision"+1 AND "research_runs"."before_receipt_id" IS NOT NULL AND "research_runs"."after_receipt_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `research_runs_before_id_unique` ON `research_runs` (`before_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `research_runs_version_id_unique` ON `research_runs` (`version_id`);--> statement-breakpoint
CREATE INDEX `research_runs_owner_created_idx` ON `research_runs` (`owner_hash`,`created_at`);