import { protectedProcedure } from "../index";
import { createInboxRepository } from "../inbox/repository";

export const alertsRouter = {
  list: protectedProcedure.handler(({ context }) => createInboxRepository(context.db).listAlerts()),
};
