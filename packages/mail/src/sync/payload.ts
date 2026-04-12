import { z } from "zod";

export const MailSyncPayloadSchema = z.discriminatedUnion("provider", [
  z.object({
    provider: z.literal("gmail"),
    mailboxId: z.string().min(1),
    reason: z.enum(["gmail-initial", "gmail-history", "gmail-renew-watch", "gmail-backfill"]),
    historyId: z.string().optional(),
    pageToken: z.string().optional(),
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
  }),
]);

export type MailSyncPayload = z.infer<typeof MailSyncPayloadSchema>;
