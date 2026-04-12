import { describe, expect, it } from "vitest";

import { bootstrapAdminConfig, loginAdmin, logoutAdmin, resolveAdminSession } from "./service";

function createMemoryStore() {
  const sessions = new Map<string, { tokenHash: string; expiresAt: Date }>();
  let passwordHash = "";

  return {
    store: {
      getPasswordHash: async () => passwordHash || null,
      setPasswordHash: async (value: string) => {
        passwordHash = value;
      },
      insertSession: async (tokenHash: string, expiresAt: Date) => {
        sessions.set(tokenHash, { tokenHash, expiresAt });
      },
      getSession: async (tokenHash: string) => sessions.get(tokenHash) ?? null,
      deleteSession: async (tokenHash: string) => {
        sessions.delete(tokenHash);
      },
    },
  };
}

describe("admin auth service", () => {
  it("bootstraps, logs in, resolves, and logs out the singleton admin", async () => {
    const { store } = createMemoryStore();

    await bootstrapAdminConfig({ store, bootstrapPassword: "super-secret-password" });
    const loginResult = await loginAdmin({ store, password: "super-secret-password" });

    expect(loginResult.ok).toBe(true);
    if (!loginResult.ok) throw new Error("expected login to succeed");

    await expect(resolveAdminSession({ store, token: loginResult.sessionToken })).resolves.toMatchObject({
      authenticated: true,
    });

    await logoutAdmin({ store, token: loginResult.sessionToken });

    await expect(resolveAdminSession({ store, token: loginResult.sessionToken })).resolves.toMatchObject({
      authenticated: false,
    });
  });
});
