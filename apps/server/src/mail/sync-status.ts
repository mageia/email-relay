import type { MailSyncPayload } from "@email-relay/mail";
import { mailbox } from "@email-relay/db/schema/mail";
import { eq } from "drizzle-orm";

const NON_SYNC_SUCCESS_REASONS = new Set<MailSyncPayload["reason"]>([
  "gmail-renew-watch",
  "outlook-renew-subscription",
]);

export function shouldRecordMailboxSyncSuccess(payload: MailSyncPayload) {
  return !NON_SYNC_SUCCESS_REASONS.has(payload.reason);
}

export async function recordMailboxSyncSuccess(
  db: { update: any },
  mailboxId: string,
  now = new Date(),
) {
  await db
    .update(mailbox)
    .set({
      lastSyncAt: now,
      lastSuccessfulSyncAt: now,
    })
    .where(eq(mailbox.id, mailboxId));
}
