import { z } from "zod";

/**
 * Backfill jobs carry the admin-selected date window. The fields are optional so
 * that incremental sync payloads (history/delta/poll) stay unchanged, but they
 * MUST be declared here: `MailSyncPayloadSchema.parse` strips unknown keys, so
 * anything missing from the schema is silently dropped before the queue consumer
 * ever sees it.
 */
const rangeFields = {
  rangeStart: z.string().datetime().optional(),
  rangeEnd: z.string().datetime().optional(),
};

export const MailSyncPayloadSchema = z.discriminatedUnion("provider", [
  z.object({
    provider: z.literal("gmail"),
    mailboxId: z.string().min(1),
    reason: z.enum(["gmail-initial", "gmail-history", "gmail-renew-watch", "gmail-backfill"]),
    historyId: z.string().optional(),
    pageToken: z.string().optional(),
    ...rangeFields,
  }),
  z.object({
    provider: z.literal("outlook"),
    mailboxId: z.string().min(1),
    reason: z.enum([
      "outlook-initial",
      "outlook-delta",
      "outlook-renew-subscription",
      "outlook-backfill",
    ]),
    deltaLink: z.string().optional(),
    folderIds: z.array(z.string()).optional(),
    nextLink: z.string().optional(),
    ...rangeFields,
  }),
  z.object({
    provider: z.literal("imap"),
    mailboxId: z.string().min(1),
    reason: z.enum(["imap-initial", "imap-poll", "imap-backfill"]),
    folderIds: z.array(z.string()).optional(),
    pageToken: z.string().optional(),
    ...rangeFields,
  }),
]);

export type MailSyncPayload = z.infer<typeof MailSyncPayloadSchema>;

export type MailSyncRange = { rangeStart: Date; rangeEnd: Date };

/**
 * Resolves the optional ISO range on a payload into concrete Dates.
 * Returns null when either bound is absent or unparseable, so callers can fall
 * back to their normal incremental behaviour instead of silently syncing everything.
 */
export function resolveSyncRange(payload: {
  rangeStart?: string;
  rangeEnd?: string;
}): MailSyncRange | null {
  if (!payload.rangeStart || !payload.rangeEnd) {
    return null;
  }

  const rangeStart = new Date(payload.rangeStart);
  const rangeEnd = new Date(payload.rangeEnd);

  if (Number.isNaN(rangeStart.getTime()) || Number.isNaN(rangeEnd.getTime())) {
    return null;
  }

  return { rangeStart, rangeEnd };
}
