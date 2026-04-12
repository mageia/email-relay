import { z } from "zod";

import { protectedProcedure } from "../index";
import { createInboxRepository } from "../inbox/repository";

export const inboxRouter = {
  listMessages: protectedProcedure
    .input(
      z.object({
        search: z.string().optional(),
        provider: z.string().optional(),
        groupId: z.string().optional(),
        mailboxId: z.string().optional(),
        limit: z.number().int().positive().max(100).optional(),
      }),
    )
    .handler(({ context, input }) => createInboxRepository(context.db).listMessages(input)),
  listFilters: protectedProcedure.handler(({ context }) => createInboxRepository(context.db).listFilters()),
};
