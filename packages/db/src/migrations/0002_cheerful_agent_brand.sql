CREATE TABLE `mail_message` (
	`id` text PRIMARY KEY NOT NULL,
	`mailbox_id` text NOT NULL,
	`provider_message_id` text NOT NULL,
	`internet_message_id` text,
	`subject` text DEFAULT '' NOT NULL,
	`snippet` text DEFAULT '' NOT NULL,
	`from_json` text NOT NULL,
	`to_json` text DEFAULT '[]' NOT NULL,
	`cc_json` text DEFAULT '[]' NOT NULL,
	`body_html` text DEFAULT '' NOT NULL,
	`body_text` text DEFAULT '' NOT NULL,
	`is_read` integer DEFAULT false NOT NULL,
	`received_at` integer NOT NULL,
	`sent_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`mailbox_id`) REFERENCES `mailbox`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `mail_message_mailbox_received_idx` ON `mail_message` (`mailbox_id`,`received_at`);--> statement-breakpoint
CREATE TABLE `mailbox` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text,
	`address` text NOT NULL,
	`provider` text NOT NULL,
	`auth_type` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`selected_folders_json` text DEFAULT '[]' NOT NULL,
	`last_sync_at` integer,
	`last_successful_sync_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `mailbox_group`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mailbox_address_unique` ON `mailbox` (`address`);--> statement-breakpoint
CREATE INDEX `mailbox_group_idx` ON `mailbox` (`group_id`);--> statement-breakpoint
CREATE TABLE `mailbox_group` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sync_alert` (
	`id` text PRIMARY KEY NOT NULL,
	`mailbox_id` text,
	`group_id` text,
	`type` text NOT NULL,
	`severity` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`title` text NOT NULL,
	`detail` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`resolved_at` integer,
	FOREIGN KEY (`mailbox_id`) REFERENCES `mailbox`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`group_id`) REFERENCES `mailbox_group`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `sync_job` (
	`id` text PRIMARY KEY NOT NULL,
	`mailbox_id` text,
	`group_id` text,
	`type` text NOT NULL,
	`status` text NOT NULL,
	`retry_count` integer DEFAULT 0 NOT NULL,
	`error_code` text,
	`error_category` text,
	`error_message` text,
	`requested_range_start` integer,
	`requested_range_end` integer,
	`requested_by` text,
	`started_at` integer,
	`finished_at` integer,
	`next_attempt_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`mailbox_id`) REFERENCES `mailbox`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`group_id`) REFERENCES `mailbox_group`(`id`) ON UPDATE no action ON DELETE set null
);
