-- Additive nullable columns preserve existing snapshots and legacy request hashes.
ALTER TABLE questionnaire_versions ADD COLUMN repair_review_id text;
--> statement-breakpoint
ALTER TABLE questionnaire_versions ADD COLUMN repair_question_id text;
--> statement-breakpoint
ALTER TABLE questionnaire_versions ADD COLUMN repair_code text;
--> statement-breakpoint
-- Existing no-update/no-delete triggers remain in force. A source must predate
-- the new revision, so origin edges cannot point to themselves or form cycles.
CREATE TRIGGER questionnaire_versions_repair_origin BEFORE INSERT ON questionnaire_versions
WHEN NOT (
  (NEW.repair_review_id IS NULL AND NEW.repair_question_id IS NULL AND NEW.repair_code IS NULL)
  OR
  (NEW.operation='append' AND NEW.repair_review_id IS NOT NULL AND NEW.repair_code IS NOT NULL
   AND length(NEW.repair_review_id) BETWEEN 1 AND 100
   AND length(NEW.repair_code) BETWEEN 1 AND 64
   AND (NEW.repair_question_id IS NULL OR length(NEW.repair_question_id) BETWEEN 1 AND 64)
   AND EXISTS(SELECT 1 FROM questionnaire_design_reviews r
     JOIN questionnaire_versions v ON v.id=r.version_id
     WHERE r.id=NEW.repair_review_id AND r.owner_hash=NEW.owner_hash AND r.project_id=NEW.project_id
       AND v.owner_hash=NEW.owner_hash AND v.project_id=NEW.project_id
       AND r.source_revision=v.revision AND r.source_sha256=v.content_sha256
       AND r.source_revision<NEW.revision))
)
BEGIN SELECT RAISE(ABORT, 'questionnaire repair origin mismatch'); END;
