import { and, desc, eq, like } from "drizzle-orm";

import { mailbox, mailboxGroup, mailMessage, syncAlert } from "@email-relay/db/schema/mail";

import { normalizeInboxFilters } from "./filter";
import type { InboxFilters } from "./types";

function buildConditions(filters: ReturnType<typeof normalizeInboxFilters>) {
  return [
    filters.provider ? eq(mailbox.provider, filters.provider) : undefined,
    filters.groupId ? eq(mailbox.groupId, filters.groupId) : undefined,
    filters.mailboxId ? eq(mailbox.id, filters.mailboxId) : undefined,
    filters.status ? eq(mailbox.status, filters.status) : undefined,
    filters.search ? like(mailMessage.bodyText, `%${filters.search}%`) : undefined,
  ].filter(Boolean);
}

export function createInboxRepository(db: any) {
  return {
    async searchMessages(input: InboxFilters): Promise<any[]> {
      const filters = normalizeInboxFilters(input);
      if (!filters.search) {
        return this.listMessages(filters);
      }

      const sql = `
        SELECT
          m.id,
          m.subject,
          m.snippet,
          m.received_at as receivedAt,
          m.is_read as isRead,
          mb.address as mailboxAddress,
          mb.provider as provider
        FROM mail_message_fts fts
        JOIN mail_message m ON m.id = fts.message_id
        JOIN mailbox mb ON mb.id = m.mailbox_id
        WHERE mail_message_fts MATCH ?
        ORDER BY bm25(mail_message_fts), m.received_at DESC
        LIMIT ?
      `;

      if (typeof db.execute === "function") {
        return db.execute(sql);
      }

      const raw = db.$client ?? db;
      if (raw?.prepare) {
        const result = await raw.prepare(sql).bind(filters.search, filters.limit).all();
        return result.results ?? [];
      }

      return [];
    },

    async listMessages(input: InboxFilters): Promise<any[]> {
      const filters = normalizeInboxFilters(input);
      if (filters.search) {
        return this.searchMessages(filters);
      }

      const conditions = buildConditions(filters);

      return db
        .select({
          id: mailMessage.id,
          subject: mailMessage.subject,
          snippet: mailMessage.snippet,
          receivedAt: mailMessage.receivedAt,
          isRead: mailMessage.isRead,
          mailboxAddress: mailbox.address,
          provider: mailbox.provider,
        })
        .from(mailMessage)
        .innerJoin(mailbox, eq(mailMessage.mailboxId, mailbox.id))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(mailMessage.receivedAt))
        .limit(filters.limit);
    },

    async listFilters() {
      const groups = await db
        .select({
          id: mailboxGroup.id,
          name: mailboxGroup.name,
        })
        .from(mailboxGroup)
        .orderBy(desc(mailboxGroup.createdAt));

      const mailboxes = await db
        .select({
          id: mailbox.id,
          address: mailbox.address,
          provider: mailbox.provider,
          status: mailbox.status,
        })
        .from(mailbox)
        .orderBy(desc(mailbox.createdAt));

      return {
        groups,
        mailboxes,
      };
    },

    async listAlerts() {
      return db.select().from(syncAlert).orderBy(desc(syncAlert.createdAt)).limit(50);
    },
  };
}
