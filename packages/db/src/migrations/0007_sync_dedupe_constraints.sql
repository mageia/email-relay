-- Deduplicate existing rows, then add the unique constraints that the upsert paths
-- rely on. Rows must be collapsed before each index is created, otherwise index
-- creation fails on pre-existing duplicates.

-- mail_message: keep the earliest row per (mailbox_id, provider_message_id).
-- The AFTER DELETE trigger from 0006 removes the matching FTS entries.
DELETE FROM mail_message
WHERE id NOT IN (
  SELECT keep_id FROM (
    SELECT MIN(rowid) AS keep_rowid, id AS keep_id
    FROM mail_message
    GROUP BY mailbox_id, provider_message_id
  )
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mail_message_mailbox_provider_message_idx` ON `mail_message` (`mailbox_id`,`provider_message_id`);--> statement-breakpoint

-- mailbox_credential: keep the newest row per (mailbox_id, provider) since that
-- holds the most recently issued tokens.
DELETE FROM mailbox_credential
WHERE rowid NOT IN (
  SELECT MAX(rowid)
  FROM mailbox_credential
  GROUP BY mailbox_id, provider
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mailbox_credential_mailbox_provider_idx` ON `mailbox_credential` (`mailbox_id`,`provider`);--> statement-breakpoint

-- imap_folder_cursor: keep the row holding the highest observed UID per folder so
-- collapsing history cannot rewind a cursor and re-download old mail.
DELETE FROM imap_folder_cursor
WHERE rowid NOT IN (
  SELECT rowid FROM (
    SELECT rowid,
           ROW_NUMBER() OVER (
             PARTITION BY mailbox_id, folder_id
             ORDER BY COALESCE(last_seen_uid, -1) DESC, rowid DESC
           ) AS rn
    FROM imap_folder_cursor
  )
  WHERE rn = 1
);
--> statement-breakpoint
CREATE UNIQUE INDEX `imap_folder_cursor_mailbox_folder_idx` ON `imap_folder_cursor` (`mailbox_id`,`folder_id`);
