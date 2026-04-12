import { eq } from "drizzle-orm";
import { z } from "zod";

import { mailbox, syncJob } from "@email-relay/db/schema/mail";

import { protectedProcedure } from "../index";
import { enqueueGroupBackfill, enqueueMailboxBackfill } from "../operations/backfill";

function getQueue(context: { env: Record<string, unknown> }) {
  return context.env.MAIL_SYNC_QUEUE as { send: (payload: unknown) => Promise<void> };
}

export const operationsRouter = {
  triggerMailboxBackfill: protectedProcedure
    .input(
      z.object({
        mailboxId: z.string().min(1),
        rangeStart: z.string().datetime(),
        rangeEnd: z.string().datetime(),
      }),
    )
    .handler(async ({ context, input }) => {
      const mailboxes = await context.db.select().from(mailbox);
      const mailboxRow = mailboxes.find(
        (entry: { id: string; provider: "gmail" | "outlook" | "imap" }) => entry.id === input.mailboxId,
      );
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
