CREATE TABLE `diagnoses` (
	`id` text PRIMARY KEY NOT NULL,
	`input_fingerprint` text NOT NULL,
	`readiness` integer NOT NULL,
	`q_score` integer NOT NULL,
	`d_score` integer NOT NULL,
	`i_score` integer NOT NULL,
	`a_score` integer NOT NULL,
	`risk_codes` text NOT NULL,
	`next_step_codes` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `diagnoses_created_at_idx` ON `diagnoses` (`created_at`);--> statement-breakpoint
CREATE INDEX `diagnoses_fingerprint_idx` ON `diagnoses` (`input_fingerprint`);--> statement-breakpoint
CREATE TABLE `project_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` text NOT NULL,
	`event_type` text NOT NULL,
	`stage_from` text,
	`stage_to` text,
	`gate_name` text,
	`gate_status` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `project_events_project_created_idx` ON `project_events` (`project_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`client_key_hash` text NOT NULL,
	`title` text NOT NULL,
	`stage` text DEFAULT 'initialized' NOT NULL,
	`gate_status` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `projects_client_key_hash_idx` ON `projects` (`client_key_hash`);--> statement-breakpoint
CREATE INDEX `projects_client_updated_idx` ON `projects` (`client_key_hash`,`updated_at`);