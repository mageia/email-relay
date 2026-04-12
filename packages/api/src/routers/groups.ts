import { desc } from "drizzle-orm";
import { z } from "zod";

import { mailboxGroup } from "@email-relay/db/schema/mail";

import { protectedProcedure } from "../index";
import { createGroupRepository } from "../groups/repository";

export const groupsRouter = {
  list: protectedProcedure.handler(async ({ context }) =>
    context.db.select().from(mailboxGroup).orderBy(desc(mailboxGroup.createdAt)),
  ),
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(2),
        kind: z.enum(["personal", "project", "client", "other"]),
        description: z.string().optional(),
      }),
    )
    .handler(async ({ context, input }) => {
      const repository = createGroupRepository({
        insert: async (row) => {
          await context.db.insert(mailboxGroup).values(row);
        },
        list: async () => context.db.select().from(mailboxGroup).orderBy(desc(mailboxGroup.createdAt)),
      });

      return repository.create(input);
    }),
};
