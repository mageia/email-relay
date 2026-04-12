import { protectedProcedure } from "../index";

export const adminRouter = {
  getSession: protectedProcedure.handler(({ context }) => ({
    authenticated: true,
    expiresAt: context.adminSession.expiresAt,
  })),
};
