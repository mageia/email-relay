import { desc, eq } from "drizzle-orm";
import { z } from "zod";

import { mailbox, syncJob } from "@email-relay/db/schema/mail";

import { protectedProcedure } from "../index";
import { enqueueGroupBackfill, enqueueMailboxBackfill, requeueHistoryBackfillJob } from "../operations/backfill";

function getQueue(context: { env: Record<string, unknown> }) {
  return context.env.MAIL_SYNC_QUEUE as { send: (payload: unknown) => Promise<void> };
}

export const operationsRouter = {
  listRetryJobs: protectedProcedure.handler(async ({ context }) => {
    const rows = await context.db
      .select({
        id: syncJob.id,
        mailboxId: syncJob.mailboxId,
        type: syncJob.type,
        retryCount: syncJob.retryCount,
        errorCategory: syncJob.errorCategory,
        errorMessage: syncJob.errorMessage,
        requestedRangeStart: syncJob.requestedRangeStart,
        requestedRangeEnd: syncJob.requestedRangeEnd,
        nextAttemptAt: syncJob.nextAttemptAt,
        mailboxAddress: mailbox.address,
        provider: mailbox.provider,
      })
      .from(syncJob)
      .leftJoin(mailbox, eq(syncJob.mailboxId, mailbox.id))
      .where(eq(syncJob.status, "retry-scheduled"))
      .orderBy(desc(syncJob.nextAttemptAt), desc(syncJob.createdAt));

    return rows;
  }),
  retryJob: protectedProcedure
    .input(
      z.object({
        jobId: z.string().min(1),
      }),
    )
    .handler(async ({ context, input }) => {
      const rows = await context.db
        .select({
          id: syncJob.id,
          mailboxId: syncJob.mailboxId,
          type: syncJob.type,
          requestedRangeStart: syncJob.requestedRangeStart,
          requestedRangeEnd: syncJob.requestedRangeEnd,
          provider: mailbox.provider,
        })
        .from(syncJob)
        .leftJoin(mailbox, eq(syncJob.mailboxId, mailbox.id))
        .where(eq(syncJob.id, input.jobId))
        .limit(1);

      const retryJobRow = rows[0];
      if (!retryJobRow || !retryJobRow.mailboxId || !retryJobRow.provider) {
        throw new Error("Retry job not found");
      }

      await requeueHistoryBackfillJob({
        job: retryJobRow,
        mailbox: {
          id: retryJobRow.mailboxId,
          provider: retryJobRow.provider as "gmail" | "outlook" | "imap",
        },
        updateJob: async (jobId, patch) => {
          await context.db.update(syncJob).set(patch).where(eq(syncJob.id, jobId));
        },
        enqueue: async (payload) => {
          await getQueue(context).send(payload);
        },
      });

      return { ok: true };
    }),
  triggerMailboxBackfill: protectedProcedure
    .input(
      z.object({
        mailboxId: z.string().min(1),
        rangeStart: z.string().datetime(),
        rangeEnd: z.string().datetime(),
      }),
    )
    .handler(async ({ context, input }) => {
      const [mailboxRow] = await context.db
        .select({ id: mailbox.id, provider: mailbox.provider })
        .from(mailbox)
        .where(eq(mailbox.id, input.mailboxId))
        .limit(1);
      if (!mailboxRow) {
        throw new Error("Mailbox not found");
      }

      await enqueueMailboxBackfill({
        mailbox: { id: mailboxRow.id, provider: mailboxRow.provider },
        rangeStart: new Date(input.rangeStart),
        rangeEnd: new Date(input.rangeEnd),
        requestedBy: "admin",
        insertJob: async (job) => {
          await context.db.insert(syncJob).values(job);
        },
        enqueue: async (payload) => {
          await getQueue(context).send(payload);
        },
      });

      return { ok: true };
    }),
  triggerGroupBackfill: protectedProcedure
    .input(
      z.object({
        groupId: z.string().min(1),
        rangeStart: z.string().datetime(),
        rangeEnd: z.string().datetime(),
      }),
    )
    .handler(async ({ context, input }) => {
      const mailboxes = await context.db
        .select()
        .from(mailbox)
        .where(eq(mailbox.groupId, input.groupId));

      await enqueueGroupBackfill({
        mailboxes: mailboxes.map(
          (entry: { id: string; provider: "gmail" | "outlook" | "imap" }) => ({
            id: entry.id,
            provider: entry.provider,
          }),
        ),
        rangeStart: new Date(input.rangeStart),
        rangeEnd: new Date(input.rangeEnd),
        requestedBy: "admin",
        groupId: input.groupId,
        insertJob: async (job) => {
          await context.db.insert(syncJob).values(job);
        },
        enqueue: async (payload) => {
          await getQueue(context).send(payload);
        },
      });

      return { ok: true };
    }),
};
