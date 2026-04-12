CREATE TABLE `outlook_mailbox_state` (
	`mailbox_id` text PRIMARY KEY NOT NULL,
	`outlook_address` text NOT NULL,
	`delta_link` text,
	`subscription_id` text,
	`subscription_resource` text,
	`subscription_expires_at` integer,
	`last_delta_sync_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`mailbox_id`) REFERENCES `mailbox`(`id`) ON UPDATE no action ON DELETE cascade
);
