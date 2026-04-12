import { eq, sql } from "drizzle-orm";
import { z } from "zod";

import { mailbox, syncAlert, syncJob } from "@email-relay/db/schema/mail";

import { protectedProcedure } from "../index";
import { createInboxRepository } from "../inbox/repository";

export const alertsRouter = {
  list: protectedProcedure.handler(({ context }) => createInboxRepository(context.db).listAlerts()),
  resolve: protectedProcedure
    .input(
      z.object({
        alertId: z.string().min(1),
      }),
    )
    .handler(({ context, input }) =>
      context.db
        .update(syncAlert)
        .set({
          status: "resolved",
          resolvedAt: new Date(),
        })
        .where(eq(syncAlert.id, input.alertId)),
    ),
  summary: protectedProcedure.handler(async ({ context }) => {
    const openAlertsRows = await context.db
      .select({
        count: sql<number>`count(*)`,
      })
      .from(syncAlert)
      .where(eq(syncAlert.status, "open"));

    const retryRows = await context.db
      .select({
        count: sql<number>`count(*)`,
      })
      .from(syncJob)
      .where(eq(syncJob.status, "retry-scheduled"));

    const staleRows = await context.db
      .select({
        count: sql<number>`count(*)`,
      })
      .from(mailbox)
      .where(sql`${mailbox.lastSuccessfulSyncAt} IS NOT NULL AND ${mailbox.lastSuccessfulSyncAt} < ${Date.now() - 60 * 60 * 1000}`);

    return {
      openAlerts: openAlertsRows[0]?.count ?? 0,
      retriesQueued: retryRows[0]?.count ?? 0,
      staleMailboxes: staleRows[0]?.count ?? 0,
    };
  }),
};
