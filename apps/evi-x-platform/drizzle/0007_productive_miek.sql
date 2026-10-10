CREATE TABLE `native_editor_sessions` (
	`key` text PRIMARY KEY NOT NULL,
	`owner_hash` text NOT NULL,
	`file_id` text NOT NULL,
	`source_version_id` text NOT NULL,
	`source_sha256` text NOT NULL,
	`filename` text NOT NULL,
	`kind` text NOT NULL,
	`base_revision` integer NOT NULL,
	`save_version_id` text NOT NULL,
	`state` text DEFAULT 'open' NOT NULL,
	`save_sha256` text,
	`saved_revision` integer,
	`created_at_ms` integer NOT NULL,
	`expires_at_ms` integer NOT NULL,
	FOREIGN KEY (`file_id`) REFERENCES `office_files`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_version_id`) REFERENCES `office_file_versions`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "native_editor_sessions_kind_check" CHECK("native_editor_sessions"."kind" IN ('docx','pptx')),
	CONSTRAINT "native_editor_sessions_revision_check" CHECK("native_editor_sessions"."base_revision" BETWEEN 1 AND 19),
	CONSTRAINT "native_editor_sessions_state_check" CHECK("native_editor_sessions"."state" IN ('open','closed','saved','conflict','error')),
	CONSTRAINT "native_editor_sessions_source_hash_check" CHECK(length("native_editor_sessions"."source_sha256") = 64 AND "native_editor_sessions"."source_sha256" NOT GLOB '*[^0-9a-f]*'),
	CONSTRAINT "native_editor_sessions_saved_hash_check" CHECK("native_editor_sessions"."save_sha256" IS NULL OR (length("native_editor_sessions"."save_sha256") = 64 AND "native_editor_sessions"."save_sha256" NOT GLOB '*[^0-9a-f]*')),
	CONSTRAINT "native_editor_sessions_time_check" CHECK("native_editor_sessions"."expires_at_ms" = "native_editor_sessions"."created_at_ms" + 28800000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `native_editor_sessions_save_version_id_unique` ON `native_editor_sessions` (`save_version_id`);--> statement-breakpoint
CREATE INDEX `native_editor_sessions_owner_state_idx` ON `native_editor_sessions` (`owner_hash`,`state`,`expires_at_ms`);