import { ORPCError, os } from "@orpc/server";

import type { Context } from "./context-type";

export const o = os.$context<Context>();

export const publicProcedure = o;

const requireAuth = o.middleware(async ({ context, next }) => {
  if (!context.adminSession) {
    throw new ORPCError("UNAUTHORIZED");
  }
  return next({
    context: {
      ...context,
      adminSession: context.adminSession,
    },
  });
});

export const protectedProcedure = publicProcedure.use(requireAuth);
