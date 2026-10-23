CREATE TABLE `questionnaire_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`owner_hash` text NOT NULL,
	`revision` integer NOT NULL,
	`base_revision` integer NOT NULL,
	`operation` text NOT NULL,
	`label` text NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`content_sha256` text NOT NULL,
	`request_sha256` text NOT NULL,
	`size` integer NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT "questionnaire_versions_revision_check" CHECK(typeof("questionnaire_versions"."revision") = 'integer' AND "questionnaire_versions"."revision" BETWEEN 1 AND 40 AND "questionnaire_versions"."revision" = "questionnaire_versions"."base_revision" + 1),
	CONSTRAINT "questionnaire_versions_operation_check" CHECK(("questionnaire_versions"."operation" = 'create' AND "questionnaire_versions"."base_revision" = 0) OR ("questionnaire_versions"."operation" = 'append' AND "questionnaire_versions"."base_revision" BETWEEN 1 AND 39)),
	CONSTRAINT "questionnaire_versions_size_check" CHECK("questionnaire_versions"."size" BETWEEN 1 AND 300000),
	CONSTRAINT "questionnaire_versions_content_hash_check" CHECK(length("questionnaire_versions"."content_sha256") = 64 AND "questionnaire_versions"."content_sha256" NOT GLOB '*[^0-9a-f]*'),
	CONSTRAINT "questionnaire_versions_request_hash_check" CHECK(length("questionnaire_versions"."request_sha256") = 64 AND "questionnaire_versions"."request_sha256" NOT GLOB '*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `questionnaire_versions_project_revision_idx` ON `questionnaire_versions` (`project_id`,`revision`);--> statement-breakpoint
CREATE INDEX `questionnaire_versions_owner_project_idx` ON `questionnaire_versions` (`owner_hash`,`project_id`,`revision`);
--> statement-breakpoint
-- Append-only at the storage boundary; these triggers are intentionally maintained in SQL.
CREATE TRIGGER `questionnaire_versions_no_update` BEFORE UPDATE ON `questionnaire_versions`
BEGIN SELECT RAISE(ABORT, 'questionnaire versions are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `questionnaire_versions_no_delete` BEFORE DELETE ON `questionnaire_versions`
BEGIN SELECT RAISE(ABORT, 'questionnaire versions are immutable'); END;
