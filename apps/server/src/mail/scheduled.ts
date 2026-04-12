import { createDb } from "@email-relay/db";
import { imapMailboxState } from "@email-relay/db/schema/imap";
import { mailbox, syncAlert } from "@email-relay/db/schema/mail";
import { outlookMailboxState } from "@email-relay/db/schema/outlook";
import { gmailMailboxState } from "@email-relay/db/schema/provider";
import { toSyncAlertInput } from "@email-relay/api/operations/alerts";

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

  const outlookStates = await db.select().from(outlookMailboxState);
  const subscriptionRenewBeforeMs = 12 * 60 * 60 * 1000;

  for (const state of outlookStates as Array<{
    mailboxId: string;
    subscriptionExpiresAt?: Date | null;
    deltaLink?: string | null;
  }>) {
    if (
      !state.subscriptionExpiresAt ||
      state.subscriptionExpiresAt.getTime() <= now + subscriptionRenewBeforeMs
    ) {
      await env.MAIL_SYNC_QUEUE.send({
        provider: "outlook",
        mailboxId: state.mailboxId,
        reason: "outlook-renew-subscription",
        deltaLink: state.deltaLink ?? undefined,
      });
    }
  }

  const imapStates = await db.select().from(imapMailboxState);
  for (const state of imapStates as Array<{ mailboxId: string }>) {
    await env.MAIL_SYNC_QUEUE.send({
      provider: "imap",
      mailboxId: state.mailboxId,
      reason: "imap-poll",
    });
  }

  const staleThreshold = Date.now() - 60 * 60 * 1000;
  const mailboxes = await db.select().from(mailbox);
  for (const row of mailboxes as Array<{
    id: string;
    groupId?: string | null;
    lastSuccessfulSyncAt?: Date | null;
  }>) {
    if (!row.lastSuccessfulSyncAt || row.lastSuccessfulSyncAt.getTime() >= staleThreshold) {
      continue;
    }

    await db.insert(syncAlert).values(
      toSyncAlertInput({
        mailboxId: row.id,
        groupId: row.groupId ?? undefined,
        category: "stale-sync",
        detail: "超过 1 小时没有成功同步",
      }),
    );
  }
}
