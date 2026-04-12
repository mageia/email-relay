CREATE TABLE `imap_folder_cursor` (
	`id` text PRIMARY KEY NOT NULL,
	`mailbox_id` text NOT NULL,
	`folder_id` text NOT NULL,
	`uid_validity` text,
	`last_seen_uid` integer,
	`last_polled_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`mailbox_id`) REFERENCES `mailbox`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `imap_mailbox_state` (
	`mailbox_id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`host` text NOT NULL,
	`port` integer NOT NULL,
	`secure` integer DEFAULT true NOT NULL,
	`auth_type` text NOT NULL,
	`discovery_source` text DEFAULT 'fallback' NOT NULL,
	`last_validated_at` integer,
	`last_poll_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`mailbox_id`) REFERENCES `mailbox`(`id`) ON UPDATE no action ON DELETE cascade
);
