CREATE TABLE `office_file_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`file_id` text NOT NULL,
	`revision` integer NOT NULL,
	`filename` text NOT NULL,
	`label` text NOT NULL,
	`size` integer NOT NULL,
	`sha256` text NOT NULL,
	`object_key` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`file_id`) REFERENCES `office_files`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "office_file_versions_revision_check" CHECK("office_file_versions"."revision" BETWEEN 1 AND 20),
	CONSTRAINT "office_file_versions_size_check" CHECK("office_file_versions"."size" BETWEEN 1 AND 20971520)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `office_file_versions_object_key_unique` ON `office_file_versions` (`object_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `office_file_versions_file_revision_idx` ON `office_file_versions` (`file_id`,`revision`);--> statement-breakpoint
CREATE TABLE `office_files` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_hash` text NOT NULL,
	`kind` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "office_files_kind_check" CHECK("office_files"."kind" IN ('docx','pptx')),
	CONSTRAINT "office_files_revision_check" CHECK("office_files"."revision" BETWEEN 0 AND 20)
);
--> statement-breakpoint
CREATE INDEX `office_files_owner_updated_idx` ON `office_files` (`owner_hash`,`updated_at`);--> statement-breakpoint
CREATE TABLE `office_upload_attempts` (
	`object_key` text PRIMARY KEY NOT NULL,
	`owner_hash` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT "office_upload_attempts_status_check" CHECK("office_upload_attempts"."status" IN ('pending','committed','discarded'))
);
--> statement-breakpoint
CREATE INDEX `office_upload_attempts_owner_status_idx` ON `office_upload_attempts` (`owner_hash`,`status`);