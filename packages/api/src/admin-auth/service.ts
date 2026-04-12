import { createHash, randomUUID } from "node:crypto";

import type { AdminSession, AuthStore } from "../context-type";
import { ADMIN_CONFIG_ID, ADMIN_SESSION_MAX_AGE_DAYS } from "./constants";
import { hashPassword, verifyPassword } from "./password";

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export async function bootstrapAdminConfig({
  store,
  bootstrapPassword,
}: {
  store: AuthStore;
  bootstrapPassword: string;
}) {
  const existing = await store.getPasswordHash();
  if (existing) {
    return existing;
  }

  const next = await hashPassword(bootstrapPassword);
  await store.setPasswordHash(next);
  return next;
}

export async function loginAdmin({
  store,
  password,
}: {
  store: AuthStore;
  password: string;
}): Promise<{ ok: true; sessionToken: string; expiresAt: Date } | { ok: false }> {
  const passwordHash = await store.getPasswordHash();
  if (!passwordHash) {
    return { ok: false };
  }

  const matches = await verifyPassword(password, passwordHash);
  if (!matches) {
    return { ok: false };
  }

  const sessionToken = randomUUID();
  const expiresAt = new Date(Date.now() + ADMIN_SESSION_MAX_AGE_DAYS * 24 * 60 * 60 * 1000);
  await store.insertSession(sha256(sessionToken), expiresAt);

  return {
    ok: true,
    sessionToken,
    expiresAt,
  };
}

export async function resolveAdminSession({
  store,
  token,
}: {
  store: AuthStore;
  token: string | null;
}): Promise<AdminSession | { authenticated: false }> {
  if (!token) {
    return { authenticated: false };
  }

  const session = await store.getSession(sha256(token));
  if (!session || session.expiresAt.getTime() <= Date.now()) {
    return { authenticated: false };
  }

  return {
    authenticated: true,
    expiresAt: session.expiresAt,
    adminConfigId: ADMIN_CONFIG_ID,
  };
}

export async function logoutAdmin({
  store,
  token,
}: {
  store: AuthStore;
  token: string | null;
}) {
  if (!token) {
    return;
  }

  await store.deleteSession(sha256(token));
}
