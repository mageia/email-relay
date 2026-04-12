import { createDb } from "@email-relay/db";
import { adminConfig, adminSession } from "@email-relay/db/schema/admin";
import { eq } from "drizzle-orm";
import type { Context as HonoContext } from "hono";

import type { Context } from "./context-type";
import { parseAdminSessionCookie } from "./admin-auth/cookie";
import { bootstrapAdminConfig, resolveAdminSession } from "./admin-auth/service";

export type CreateContextOptions = {
  context: HonoContext;
};

export async function createContext({ context }: CreateContextOptions): Promise<Context> {
  const db = createDb();
  const store: Context["authStore"] = {
    getPasswordHash: async () => {
      const row = await db.query.adminConfig.findFirst();
      return row?.passwordHash ?? null;
    },
    setPasswordHash: async (value: string) => {
      await db
        .insert(adminConfig)
        .values({
          id: "default",
          passwordHash: value,
        })
        .onConflictDoUpdate({
          target: adminConfig.id,
          set: {
            passwordHash: value,
          },
        });
    },
    insertSession: async (tokenHash: string, expiresAt: Date) => {
      await db.insert(adminSession).values({
        id: crypto.randomUUID(),
        tokenHash,
        expiresAt,
      });
    },
    getSession: async (tokenHash: string) => {
      const row = await db.query.adminSession.findFirst({
        where: eq(adminSession.tokenHash, tokenHash),
      });

      return row ? { expiresAt: row.expiresAt } : null;
    },
    deleteSession: async (tokenHash: string) => {
      await db.delete(adminSession).where(eq(adminSession.tokenHash, tokenHash));
    },
  };

  await bootstrapAdminConfig({
    store,
    bootstrapPassword: context.env.ADMIN_BOOTSTRAP_PASSWORD,
  });

  const token = parseAdminSessionCookie(context.req.header("cookie") ?? null);
  const adminSessionState = await resolveAdminSession({
    store,
    token,
  });

  return {
    adminSession: adminSessionState.authenticated ? adminSessionState : null,
    db,
    authStore: store,
  };
}

export type { Context } from "./context-type";
