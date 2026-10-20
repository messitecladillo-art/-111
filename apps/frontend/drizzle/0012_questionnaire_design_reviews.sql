CREATE TABLE `questionnaire_design_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_hash` text NOT NULL,
	`project_id` text NOT NULL,
	`version_id` text NOT NULL,
	`source_revision` integer NOT NULL,
	`source_sha256` text NOT NULL,
	`engine_version` text NOT NULL,
	`result_json` text NOT NULL,
	`result_sha256` text NOT NULL,
	`result_size` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`version_id`) REFERENCES `questionnaire_versions`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "questionnaire_reviews_revision_check" CHECK(typeof("questionnaire_design_reviews"."source_revision") = 'integer' AND "questionnaire_design_reviews"."source_revision" BETWEEN 1 AND 40),
	CONSTRAINT "questionnaire_reviews_size_check" CHECK(typeof("questionnaire_design_reviews"."result_size") = 'integer' AND "questionnaire_design_reviews"."result_size" BETWEEN 1 AND 1048576),
	CONSTRAINT "questionnaire_reviews_source_hash_check" CHECK(length("questionnaire_design_reviews"."source_sha256") = 64 AND "questionnaire_design_reviews"."source_sha256" NOT GLOB '*[^0-9a-f]*'),
	CONSTRAINT "questionnaire_reviews_result_hash_check" CHECK(length("questionnaire_design_reviews"."result_sha256") = 64 AND "questionnaire_design_reviews"."result_sha256" NOT GLOB '*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `questionnaire_reviews_owner_version_engine_idx` ON `questionnaire_design_reviews` (`owner_hash`,`version_id`,`engine_version`);--> statement-breakpoint
CREATE INDEX `questionnaire_reviews_owner_project_idx` ON `questionnaire_design_reviews` (`owner_hash`,`project_id`);
--> statement-breakpoint
-- Retained execution records are immutable; these guards are maintained in SQL.
CREATE TRIGGER `questionnaire_reviews_no_update` BEFORE UPDATE ON `questionnaire_design_reviews`
BEGIN SELECT RAISE(ABORT, 'questionnaire reviews are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `questionnaire_reviews_no_delete` BEFORE DELETE ON `questionnaire_design_reviews`
BEGIN SELECT RAISE(ABORT, 'questionnaire reviews are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `questionnaire_reviews_source_binding` BEFORE INSERT ON `questionnaire_design_reviews`
WHEN NOT EXISTS (
  SELECT 1 FROM `questionnaire_versions` v
  WHERE v.id=NEW.version_id AND v.project_id=NEW.project_id AND v.owner_hash=NEW.owner_hash
    AND v.revision=NEW.source_revision AND v.content_sha256=NEW.source_sha256
)
BEGIN SELECT RAISE(ABORT, 'questionnaire review source mismatch'); END;
