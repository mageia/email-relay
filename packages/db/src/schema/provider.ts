import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import { mailbox } from "./mail";

export const mailboxCredential = sqliteTable(
  "mailbox_credential",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    mailboxId: text("mailbox_id")
      .notNull()
      .references(() => mailbox.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    accessTokenSealed: text("access_token_sealed"),
    refreshTokenSealed: text("refresh_token_sealed"),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
    scope: text("scope"),
    tokenType: text("token_type"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("mailbox_credential_mailbox_idx").on(table.mailboxId),
    // One credential row per mailbox+provider so token refreshes update in place
    // instead of appending a new row on every save.
    uniqueIndex("mailbox_credential_mailbox_provider_idx").on(table.mailboxId, table.provider),
  ],
);

export const mailboxFolder = sqliteTable("mailbox_folder", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  mailboxId: text("mailbox_id")
    .notNull()
    .references(() => mailbox.id, { onDelete: "cascade" }),
  providerFolderId: text("provider_folder_id").notNull(),
  displayName: text("display_name").notNull(),
  kind: text("kind").notNull(),
  selected: integer("selected", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .$onUpdate(() => new Date())
    .notNull(),
});

export const gmailMailboxState = sqliteTable("gmail_mailbox_state", {
  mailboxId: text("mailbox_id")
    .primaryKey()
    .references(() => mailbox.id, { onDelete: "cascade" }),
  gmailAddress: text("gmail_address").notNull(),
  lastHistoryId: text("last_history_id"),
  watchExpirationAt: integer("watch_expiration_at", { mode: "timestamp_ms" }),
  watchStatus: text("watch_status").notNull().default("inactive"),
  lastFullSyncAt: integer("last_full_sync_at", { mode: "timestamp_ms" }),
  lastPartialSyncAt: integer("last_partial_sync_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .$onUpdate(() => new Date())
    .notNull(),
});
