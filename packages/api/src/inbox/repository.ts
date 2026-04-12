import { and, desc, eq, like } from "drizzle-orm";

import { mailbox, mailboxGroup, mailMessage, syncAlert } from "@email-relay/db/schema/mail";

import { normalizeInboxFilters } from "./filter";
import type { InboxFilters } from "./types";

function buildConditions(filters: ReturnType<typeof normalizeInboxFilters>) {
  return [
    filters.provider ? eq(mailbox.provider, filters.provider) : undefined,
    filters.groupId ? eq(mailbox.groupId, filters.groupId) : undefined,
    filters.mailboxId ? eq(mailbox.id, filters.mailboxId) : undefined,
    filters.search ? like(mailMessage.bodyText, `%${filters.search}%`) : undefined,
  ].filter(Boolean);
}

export function createInboxRepository(db: any) {
  return {
    async listMessages(input: InboxFilters) {
      const filters = normalizeInboxFilters(input);
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
