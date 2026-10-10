CREATE TABLE `native_editor_recoveries` (
	`key` text PRIMARY KEY NOT NULL,
	`owner_hash` text NOT NULL,
	`object_key` text NOT NULL,
	`sha256` text NOT NULL,
	`size` integer NOT NULL,
	`state` text DEFAULT 'reserved' NOT NULL,
	`created_at_ms` integer NOT NULL,
	`expires_at_ms` integer,
	FOREIGN KEY (`key`) REFERENCES `native_editor_sessions`(`key`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "native_editor_recoveries_state_check" CHECK("native_editor_recoveries"."state" IN ('reserved','ready')),
	CONSTRAINT "native_editor_recoveries_size_check" CHECK("native_editor_recoveries"."size" BETWEEN 1 AND 20971520),
	CONSTRAINT "native_editor_recoveries_hash_check" CHECK(length("native_editor_recoveries"."sha256") = 64 AND "native_editor_recoveries"."sha256" NOT GLOB '*[^0-9a-f]*'),
	CONSTRAINT "native_editor_recoveries_time_check" CHECK("native_editor_recoveries"."expires_at_ms" IS NULL OR ("native_editor_recoveries"."expires_at_ms" > "native_editor_recoveries"."created_at_ms" AND "native_editor_recoveries"."expires_at_ms" <= "native_editor_recoveries"."created_at_ms" + 31536000000))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `native_editor_recoveries_object_key_unique` ON `native_editor_recoveries` (`object_key`);--> statement-breakpoint
CREATE INDEX `native_editor_recoveries_owner_expiry_idx` ON `native_editor_recoveries` (`owner_hash`,`expires_at_ms`);
