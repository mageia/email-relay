import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { mailbox } from "./mail";

export const outlookMailboxState = sqliteTable("outlook_mailbox_state", {
  mailboxId: text("mailbox_id")
    .primaryKey()
    .references(() => mailbox.id, { onDelete: "cascade" }),
  outlookAddress: text("outlook_address").notNull(),
  deltaLink: text("delta_link"),
  subscriptionId: text("subscription_id"),
  subscriptionResource: text("subscription_resource"),
  subscriptionExpiresAt: integer("subscription_expires_at", { mode: "timestamp_ms" }),
  lastDeltaSyncAt: integer("last_delta_sync_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .$onUpdate(() => new Date())
    .notNull(),
});
