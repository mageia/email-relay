import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { mailbox } from "./mail";

export const imapMailboxState = sqliteTable("imap_mailbox_state", {
  mailboxId: text("mailbox_id")
    .primaryKey()
    .references(() => mailbox.id, { onDelete: "cascade" }),
  username: text("username").notNull(),
  host: text("host").notNull(),
  port: integer("port").notNull(),
  secure: integer("secure", { mode: "boolean" }).notNull().default(true),
  authType: text("auth_type").notNull(),
  discoverySource: text("discovery_source").notNull().default("fallback"),
  lastValidatedAt: integer("last_validated_at", { mode: "timestamp_ms" }),
  lastPollAt: integer("last_poll_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .$onUpdate(() => new Date())
    .notNull(),
});

export const imapFolderCursor = sqliteTable(
  "imap_folder_cursor",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    mailboxId: text("mailbox_id")
      .notNull()
      .references(() => mailbox.id, { onDelete: "cascade" }),
    folderId: text("folder_id").notNull(),
    uidValidity: text("uid_validity"),
    lastSeenUid: integer("last_seen_uid"),
    lastPolledAt: integer("last_polled_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  // One cursor row per mailbox+folder. Previously every poll appended a row and
  // readers relied on reverse().find(), so the table grew without bound.
  (table) => [uniqueIndex("imap_folder_cursor_mailbox_folder_idx").on(table.mailboxId, table.folderId)],
);
