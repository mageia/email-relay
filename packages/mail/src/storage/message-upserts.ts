import { and, eq } from "drizzle-orm";
import { mailMessage } from "@email-relay/db/schema/mail";

export type NormalizedMessageInput = {
  mailboxId: string;
  providerMessageId: string;
  internetMessageId: string | null;
  subject: string;
  snippet: string;
  fromJson: string;
  toJson: string;
  ccJson: string;
  bodyHtml: string;
  bodyText: string;
  isRead: boolean;
  receivedAt: Date;
  sentAt: Date | null;
};

/**
 * Idempotent write keyed on (mailboxId, providerMessageId).
 *
 * Queue messages can legitimately arrive more than once: pagination self-enqueues,
 * webhook replays, cron overlap, and now genuine queue retries. A plain insert
 * produced duplicate rows and duplicate FTS entries, so this upserts instead.
 */
export async function upsertNormalizedMessage(db: any, input: NormalizedMessageInput) {
  const [created] = await db
    .insert(mailMessage)
    .values(input)
    .onConflictDoUpdate({
      target: [mailMessage.mailboxId, mailMessage.providerMessageId],
      set: {
        internetMessageId: input.internetMessageId,
        subject: input.subject,
        snippet: input.snippet,
        fromJson: input.fromJson,
        toJson: input.toJson,
        ccJson: input.ccJson,
        bodyHtml: input.bodyHtml,
        bodyText: input.bodyText,
        isRead: input.isRead,
        receivedAt: input.receivedAt,
        sentAt: input.sentAt,
      },
    })
    .returning({ id: mailMessage.id });

  if (created?.id) {
    return created.id;
  }

  // Defensive fallback: a driver that does not surface RETURNING rows on the
  // conflict path would otherwise return undefined.
  const [existing] = await db
    .select({ id: mailMessage.id })
    .from(mailMessage)
    .where(
      and(
        eq(mailMessage.mailboxId, input.mailboxId),
        eq(mailMessage.providerMessageId, input.providerMessageId),
      ),
    )
    .limit(1);

  return existing?.id ?? null;
}
