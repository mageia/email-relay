import { eq, sql } from "drizzle-orm";
import { createDb } from "@email-relay/db";
import { imapMailboxState } from "@email-relay/db/schema/imap";
import { mailbox, syncJob } from "@email-relay/db/schema/mail";
import { outlookMailboxState } from "@email-relay/db/schema/outlook";
import { gmailMailboxState } from "@email-relay/db/schema/provider";
import { buildBackfillPayloads } from "@email-relay/mail";

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

  const retryJobs = await db
    .select()
    .from(syncJob)
    .where(
      eq(syncJob.status, "retry-scheduled"),
      sql`${syncJob.nextAttemptAt} <= ${now}`,
    );

  for (const job of retryJobs as Array<{
    id: string;
    mailboxId?: string | null;
    type: string;
    requestedRangeStart?: Date | number | null;
    requestedRangeEnd?: Date | number | null;
  }>) {
    if (
      job.type !== "history-backfill" ||
      !job.mailboxId ||
      !job.requestedRangeStart ||
      !job.requestedRangeEnd
    ) {
      continue;
    }

    const mailboxRow = (
      await db.select().from(mailbox).where(eq(mailbox.id, job.mailboxId)).limit(1)
    )[0];
    if (!mailboxRow) {
      continue;
    }

    const rangeStart =
      job.requestedRangeStart instanceof Date
        ? job.requestedRangeStart
        : new Date(job.requestedRangeStart);
    const rangeEnd =
      job.requestedRangeEnd instanceof Date
        ? job.requestedRangeEnd
        : new Date(job.requestedRangeEnd);
    if (Number.isNaN(rangeStart.getTime()) || Number.isNaN(rangeEnd.getTime())) {
      continue;
    }

    const [payload] = buildBackfillPayloads({
      mailboxes: [
        {
          id: mailboxRow.id,
          provider: mailboxRow.provider as "gmail" | "outlook" | "imap",
        },
      ],
      rangeStart,
      rangeEnd,
    });

    await env.MAIL_SYNC_QUEUE.send(payload);

    await db
      .update(syncJob)
      .set({
        status: "queued",
        nextAttemptAt: null,
        startedAt: null,
      })
      .where(eq(syncJob.id, job.id));
  }
}
