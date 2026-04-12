CREATE TABLE `gmail_mailbox_state` (
	`mailbox_id` text PRIMARY KEY NOT NULL,
	`gmail_address` text NOT NULL,
	`last_history_id` text,
	`watch_expiration_at` integer,
	`watch_status` text DEFAULT 'inactive' NOT NULL,
	`last_full_sync_at` integer,
	`last_partial_sync_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`mailbox_id`) REFERENCES `mailbox`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `mailbox_credential` (
	`id` text PRIMARY KEY NOT NULL,
	`mailbox_id` text NOT NULL,
	`provider` text NOT NULL,
	`access_token_sealed` text,
	`refresh_token_sealed` text,
	`expires_at` integer,
	`scope` text,
	`token_type` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`mailbox_id`) REFERENCES `mailbox`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `mailbox_credential_mailbox_idx` ON `mailbox_credential` (`mailbox_id`);--> statement-breakpoint
CREATE TABLE `mailbox_folder` (
	`id` text PRIMARY KEY NOT NULL,
	`mailbox_id` text NOT NULL,
	`provider_folder_id` text NOT NULL,
	`display_name` text NOT NULL,
	`kind` text NOT NULL,
	`selected` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`mailbox_id`) REFERENCES `mailbox`(`id`) ON UPDATE no action ON DELETE cascade
);
