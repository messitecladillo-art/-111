PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_native_editor_sessions` (
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
	`state_changed_at_ms` integer,
	`save_sha256` text,
	`saved_revision` integer,
	`created_at_ms` integer NOT NULL,
	`expires_at_ms` integer NOT NULL,
	FOREIGN KEY (`file_id`) REFERENCES `office_files`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_version_id`) REFERENCES `office_file_versions`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "native_editor_sessions_kind_check" CHECK("__new_native_editor_sessions"."kind" IN ('docx','pptx')),
	CONSTRAINT "native_editor_sessions_revision_check" CHECK("__new_native_editor_sessions"."base_revision" BETWEEN 1 AND 19),
	CONSTRAINT "native_editor_sessions_state_check" CHECK("__new_native_editor_sessions"."state" IN ('open','closing','saving','saved','conflict','error')),
	CONSTRAINT "native_editor_sessions_state_time_check" CHECK("__new_native_editor_sessions"."state_changed_at_ms" IS NULL OR "__new_native_editor_sessions"."state_changed_at_ms" BETWEEN "__new_native_editor_sessions"."created_at_ms" AND "__new_native_editor_sessions"."expires_at_ms"),
	CONSTRAINT "native_editor_sessions_source_hash_check" CHECK(length("__new_native_editor_sessions"."source_sha256") = 64 AND "__new_native_editor_sessions"."source_sha256" NOT GLOB '*[^0-9a-f]*'),
	CONSTRAINT "native_editor_sessions_saved_hash_check" CHECK("__new_native_editor_sessions"."save_sha256" IS NULL OR (length("__new_native_editor_sessions"."save_sha256") = 64 AND "__new_native_editor_sessions"."save_sha256" NOT GLOB '*[^0-9a-f]*')),
	CONSTRAINT "native_editor_sessions_time_check" CHECK("__new_native_editor_sessions"."expires_at_ms" = "__new_native_editor_sessions"."created_at_ms" + 28800000)
);
--> statement-breakpoint
INSERT INTO `__new_native_editor_sessions`("key", "owner_hash", "file_id", "source_version_id", "source_sha256", "filename", "kind", "base_revision", "save_version_id", "state", "state_changed_at_ms", "save_sha256", "saved_revision", "created_at_ms", "expires_at_ms") SELECT "key", "owner_hash", "file_id", "source_version_id", "source_sha256", "filename", "kind", "base_revision", "save_version_id", CASE WHEN "state"='closed' THEN 'closing' ELSE "state" END, CASE WHEN "state"='closed' THEN "created_at_ms" ELSE NULL END, "save_sha256", "saved_revision", "created_at_ms", "expires_at_ms" FROM `native_editor_sessions`;--> statement-breakpoint
DROP TABLE `native_editor_sessions`;--> statement-breakpoint
ALTER TABLE `__new_native_editor_sessions` RENAME TO `native_editor_sessions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `native_editor_sessions_save_version_id_unique` ON `native_editor_sessions` (`save_version_id`);--> statement-breakpoint
CREATE INDEX `native_editor_sessions_owner_state_idx` ON `native_editor_sessions` (`owner_hash`,`state`,`expires_at_ms`);
