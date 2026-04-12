import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const mailboxGroup = sqliteTable("mailbox_group", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  kind: text("kind").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .$onUpdate(() => new Date())
    .notNull(),
});

export const mailbox = sqliteTable(
  "mailbox",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    groupId: text("group_id").references(() => mailboxGroup.id, { onDelete: "set null" }),
    address: text("address").notNull().unique(),
    provider: text("provider").notNull(),
    authType: text("auth_type").notNull(),
    status: text("status").notNull().default("pending"),
    selectedFoldersJson: text("selected_folders_json").notNull().default("[]"),
    lastSyncAt: integer("last_sync_at", { mode: "timestamp_ms" }),
    lastSuccessfulSyncAt: integer("last_successful_sync_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("mailbox_group_idx").on(table.groupId)],
);

export const mailMessage = sqliteTable(
  "mail_message",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    mailboxId: text("mailbox_id")
      .notNull()
      .references(() => mailbox.id, { onDelete: "cascade" }),
    providerMessageId: text("provider_message_id").notNull(),
    internetMessageId: text("internet_message_id"),
    subject: text("subject").notNull().default(""),
    snippet: text("snippet").notNull().default(""),
    fromJson: text("from_json").notNull(),
    toJson: text("to_json").notNull().default("[]"),
    ccJson: text("cc_json").notNull().default("[]"),
    bodyHtml: text("body_html").notNull().default(""),
    bodyText: text("body_text").notNull().default(""),
    isRead: integer("is_read", { mode: "boolean" }).notNull().default(false),
    receivedAt: integer("received_at", { mode: "timestamp_ms" }).notNull(),
    sentAt: integer("sent_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (table) => [index("mail_message_mailbox_received_idx").on(table.mailboxId, table.receivedAt)],
);

export const syncJob = sqliteTable("sync_job", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  mailboxId: text("mailbox_id").references(() => mailbox.id, { onDelete: "set null" }),
  groupId: text("group_id").references(() => mailboxGroup.id, { onDelete: "set null" }),
  type: text("type").notNull(),
  status: text("status").notNull(),
  retryCount: integer("retry_count").notNull().default(0),
  errorCode: text("error_code"),
  errorCategory: text("error_category"),
  errorMessage: text("error_message"),
  requestedRangeStart: integer("requested_range_start", { mode: "timestamp_ms" }),
  requestedRangeEnd: integer("requested_range_end", { mode: "timestamp_ms" }),
  requestedBy: text("requested_by"),
  startedAt: integer("started_at", { mode: "timestamp_ms" }),
  finishedAt: integer("finished_at", { mode: "timestamp_ms" }),
  nextAttemptAt: integer("next_attempt_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
});

export const syncAlert = sqliteTable("sync_alert", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  mailboxId: text("mailbox_id").references(() => mailbox.id, { onDelete: "set null" }),
  groupId: text("group_id").references(() => mailboxGroup.id, { onDelete: "set null" }),
  type: text("type").notNull(),
  severity: text("severity").notNull(),
  status: text("status").notNull().default("open"),
  title: text("title").notNull(),
  detail: text("detail").notNull().default(""),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
  resolvedAt: integer("resolved_at", { mode: "timestamp_ms" }),
});
