CREATE TABLE `editor_recovered_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`owner_hash` text NOT NULL,
	`verifier_hash` text NOT NULL,
	`created_at_ms` integer NOT NULL,
	`expires_at_ms` integer NOT NULL,
	FOREIGN KEY (`owner_hash`) REFERENCES `editor_recovery_keys`(`owner_hash`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "editor_recovered_sessions_token_check" CHECK(length("editor_recovered_sessions"."token_hash") = 64 AND "editor_recovered_sessions"."token_hash" NOT GLOB '*[^0-9a-f]*'),
	CONSTRAINT "editor_recovered_sessions_verifier_check" CHECK(length("editor_recovered_sessions"."verifier_hash") = 64 AND "editor_recovered_sessions"."verifier_hash" NOT GLOB '*[^0-9a-f]*'),
	CONSTRAINT "editor_recovered_sessions_created_check" CHECK(typeof("editor_recovered_sessions"."created_at_ms") = 'integer' AND "editor_recovered_sessions"."created_at_ms" BETWEEN 0 AND 8639997408000000),
	CONSTRAINT "editor_recovered_sessions_expiry_check" CHECK(typeof("editor_recovered_sessions"."expires_at_ms") = 'integer' AND "editor_recovered_sessions"."expires_at_ms" = "editor_recovered_sessions"."created_at_ms" + 2592000000)
);
--> statement-breakpoint
CREATE INDEX `editor_recovered_sessions_owner_expiry_idx` ON `editor_recovered_sessions` (`owner_hash`,`expires_at_ms`);--> statement-breakpoint
CREATE TABLE `editor_recovery_keys` (
	`owner_hash` text PRIMARY KEY NOT NULL,
	`verifier_hash` text NOT NULL,
	`revision` integer NOT NULL,
	`updated_at_ms` integer NOT NULL,
	CONSTRAINT "editor_recovery_keys_owner_check" CHECK(length("editor_recovery_keys"."owner_hash") = 64 AND "editor_recovery_keys"."owner_hash" NOT GLOB '*[^0-9a-f]*'),
	CONSTRAINT "editor_recovery_keys_verifier_check" CHECK(length("editor_recovery_keys"."verifier_hash") = 64 AND "editor_recovery_keys"."verifier_hash" NOT GLOB '*[^0-9a-f]*'),
	CONSTRAINT "editor_recovery_keys_revision_check" CHECK(typeof("editor_recovery_keys"."revision") = 'integer' AND "editor_recovery_keys"."revision" BETWEEN 1 AND 9007199254740991),
	CONSTRAINT "editor_recovery_keys_updated_check" CHECK(typeof("editor_recovery_keys"."updated_at_ms") = 'integer' AND "editor_recovery_keys"."updated_at_ms" BETWEEN 0 AND 8640000000000000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `editor_recovery_keys_verifier_idx` ON `editor_recovery_keys` (`verifier_hash`);