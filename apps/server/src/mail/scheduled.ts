import { createDb } from "@email-relay/db";
import { gmailMailboxState } from "@email-relay/db/schema/provider";

export async function handleScheduled(_controller: ScheduledController, env: Env) {
  const db = createDb();
  const gmailStates = await db.select().from(gmailMailboxState);
  const now = Date.now();
  const renewBeforeMs = 24 * 60 * 60 * 1000;
  const partialSyncStaleMs = 15 * 60 * 1000;

  for (const state of gmailStates as Array<{
    mailboxId: string;
    watchExpirationAt?: Date | null;
    lastPartialSyncAt?: Date | null;
    lastHistoryId?: string | null;
  }>) {
    if (
      !state.watchExpirationAt ||
      state.watchExpirationAt.getTime() <= now + renewBeforeMs
    ) {
      await env.MAIL_SYNC_QUEUE.send({
        provider: "gmail",
        mailboxId: state.mailboxId,
        reason: "gmail-renew-watch",
      });
    }

    if (
      state.lastHistoryId &&
      (!state.lastPartialSyncAt ||
        state.lastPartialSyncAt.getTime() <= now - partialSyncStaleMs)
    ) {
      await env.MAIL_SYNC_QUEUE.send({
        provider: "gmail",
        mailboxId: state.mailboxId,
        reason: "gmail-history",
        historyId: state.lastHistoryId,
      });
    }
  }
}
