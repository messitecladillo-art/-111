CREATE TABLE `editor_recovery_key_history` (
	`verifier_hash` text PRIMARY KEY NOT NULL,
	`owner_hash` text NOT NULL,
	`registered_at_ms` integer NOT NULL,
	FOREIGN KEY (`owner_hash`) REFERENCES `editor_recovery_keys`(`owner_hash`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "editor_recovery_key_history_verifier_check" CHECK(length("editor_recovery_key_history"."verifier_hash") = 64 AND "editor_recovery_key_history"."verifier_hash" NOT GLOB '*[^0-9a-f]*'),
	CONSTRAINT "editor_recovery_key_history_registered_check" CHECK(typeof("editor_recovery_key_history"."registered_at_ms") = 'integer' AND "editor_recovery_key_history"."registered_at_ms" BETWEEN 0 AND 8640000000000000)
);
--> statement-breakpoint
CREATE INDEX `editor_recovery_key_history_owner_idx` ON `editor_recovery_key_history` (`owner_hash`);