import type { RouterClient } from "@orpc/server";

import { protectedProcedure, publicProcedure } from "../index";
import { adminRouter } from "./admin";
import { alertsRouter } from "./alerts";
import { groupsRouter } from "./groups";
import { inboxRouter } from "./inbox";
import { mailboxesRouter } from "./mailboxes";
import { operationsRouter } from "./operations";

export const appRouter = {
  admin: adminRouter,
  inbox: inboxRouter,
  groups: groupsRouter,
  alerts: alertsRouter,
  mailboxes: mailboxesRouter,
  operations: operationsRouter,
  healthCheck: publicProcedure.handler(() => {
    return "OK";
  }),
  privateData: protectedProcedure.handler(() => {
    return {
      message: "This is private",
      admin: true,
    };
  }),
};
export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
