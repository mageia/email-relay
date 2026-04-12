import { z } from "zod";

import { protectedProcedure } from "../index";
import { createMailboxRepository } from "../mailboxes/repository";

export const mailboxesRouter = {
  list: protectedProcedure.handler(({ context }) => createMailboxRepository(context.db).listMailboxes()),
  updateSelectedFolders: protectedProcedure
    .input(
      z.object({
        mailboxId: z.string().min(1),
        labels: z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            kind: z.string(),
          }),
        ),
      }),
    )
    .handler(({ context, input }) =>
      createMailboxRepository(context.db).replaceSelectedLabels(input.mailboxId, input.labels),
    ),
};
