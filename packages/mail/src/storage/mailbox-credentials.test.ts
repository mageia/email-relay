import { afterEach, describe, expect, it, vi } from "vitest";

import { createMailboxCredentialStore, isAccessTokenExpired } from "./mailbox-credentials";

// AES-GCM raw key import requires exactly 16, 24, or 32 bytes.
const SECRET = "0123456789abcdef0123456789abcdef";

/**
 * Minimal Drizzle-shaped stub: a single credential row keyed by mailbox, with
 * insert().onConflictDoUpdate() collapsing onto it the way the unique index does.
 */
function createDbStub(initialRow: Record<string, unknown> | null = null) {
  const state: { row: Record<string, unknown> | null } = { row: initialRow };

  return {
    state,
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => (state.row ? [state.row] : []),
        }),
      }),
    }),
    insert: () => ({
      values: (values: Record<string, unknown>) => ({
        onConflictDoUpdate: async ({ set }: { set: Record<string, unknown> }) => {
          state.row = state.row ? { ...state.row, ...set } : { ...values };
        },
      }),
    }),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isAccessTokenExpired", () => {
  const now = Date.parse("2026-04-12T12:00:00.000Z");

  it("treats a token inside the refresh skew as expired", () => {
    expect(isAccessTokenExpired(new Date(now + 60 * 1000), now)).toBe(true);
  });

  it("treats a comfortably valid token as usable", () => {
    expect(isAccessTokenExpired(new Date(now + 30 * 60 * 1000), now)).toBe(false);
  });

  it("treats a missing expiry as usable", () => {
    expect(isAccessTokenExpired(null, now)).toBe(false);
  });
});

describe("saveOauthTokens", () => {
  it("upserts rather than appending a new row per authorization", async () => {
    const db = createDbStub();
    const store = createMailboxCredentialStore(db as never, SECRET);

    await store.saveOauthTokens({
      mailboxId: "mailbox-1",
      provider: "gmail",
      accessToken: "first-token",
      refreshToken: "refresh-1",
      expiresAt: new Date("2026-04-12T13:00:00.000Z"),
    });
    await store.saveOauthTokens({
      mailboxId: "mailbox-1",
      provider: "gmail",
      accessToken: "second-token",
      expiresAt: new Date("2026-04-12T14:00:00.000Z"),
    });

    const tokens = await store.readOauthTokens("mailbox-1");
    expect(tokens?.accessToken).toBe("second-token");
    // Google omits refresh_token when refreshing, so the stored one must survive.
    expect(tokens?.refreshToken).toBe("refresh-1");
  });
});

describe("getUsableAccessToken", () => {
  it("returns the stored token while it is still valid", async () => {
    const db = createDbStub();
    const store = createMailboxCredentialStore(db as never, SECRET);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    await store.saveOauthTokens({
      mailboxId: "mailbox-1",
      provider: "gmail",
      accessToken: "valid-token",
      refreshToken: "refresh-1",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    await expect(
      store.getUsableAccessToken({
        mailboxId: "mailbox-1",
        provider: "gmail",
        credentials: { googleClientId: "id", googleClientSecret: "secret" },
      }),
    ).resolves.toBe("valid-token");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // Regression: refresh tokens were stored but never used, so every OAuth mailbox
  // broke roughly an hour after authorization.
  it("refreshes an expired Gmail token and persists the new one", async () => {
    const db = createDbStub();
    const store = createMailboxCredentialStore(db as never, SECRET);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({ access_token: "refreshed-token", expires_in: 3600, scope: "s" }),
          { status: 200 },
        ),
      ),
    );

    await store.saveOauthTokens({
      mailboxId: "mailbox-1",
      provider: "gmail",
      accessToken: "stale-token",
      refreshToken: "refresh-1",
      expiresAt: new Date(Date.now() - 60 * 1000),
    });

    await expect(
      store.getUsableAccessToken({
        mailboxId: "mailbox-1",
        provider: "gmail",
        credentials: { googleClientId: "id", googleClientSecret: "secret" },
      }),
    ).resolves.toBe("refreshed-token");

    // The refreshed token must be persisted, not just returned.
    const stored = await store.readOauthTokens("mailbox-1");
    expect(stored?.accessToken).toBe("refreshed-token");
    expect(stored?.refreshToken).toBe("refresh-1");
  });

  it("stores the rotated refresh token that Outlook returns", async () => {
    const db = createDbStub();
    const store = createMailboxCredentialStore(db as never, SECRET);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            access_token: "outlook-new",
            refresh_token: "outlook-refresh-2",
            expires_in: 3600,
          }),
          { status: 200 },
        ),
      ),
    );

    await store.saveOauthTokens({
      mailboxId: "mailbox-2",
      provider: "outlook",
      accessToken: "outlook-old",
      refreshToken: "outlook-refresh-1",
      expiresAt: new Date(Date.now() - 1000),
    });

    await expect(
      store.getUsableAccessToken({
        mailboxId: "mailbox-2",
        provider: "outlook",
        credentials: { microsoftClientId: "id", microsoftClientSecret: "secret" },
      }),
    ).resolves.toBe("outlook-new");

    const stored = await store.readOauthTokens("mailbox-2");
    expect(stored?.refreshToken).toBe("outlook-refresh-2");
  });

  it("passes IMAP passwords through without attempting a refresh", async () => {
    const db = createDbStub();
    const store = createMailboxCredentialStore(db as never, SECRET);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    await store.saveOauthTokens({
      mailboxId: "mailbox-3",
      provider: "imap",
      accessToken: "account-password",
      expiresAt: new Date(Date.now() - 60 * 1000),
    });

    await expect(
      store.getUsableAccessToken({
        mailboxId: "mailbox-3",
        provider: "imap",
        credentials: {},
      }),
    ).resolves.toBe("account-password");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("raises an auth-expired style error when no refresh token is stored", async () => {
    const db = createDbStub();
    const store = createMailboxCredentialStore(db as never, SECRET);

    await store.saveOauthTokens({
      mailboxId: "mailbox-4",
      provider: "gmail",
      accessToken: "stale-token",
      expiresAt: new Date(Date.now() - 60 * 1000),
    });

    // The message must contain invalid_grant so classifySyncError routes it to the
    // non-retryable auth-expired category and raises an alert.
    await expect(
      store.getUsableAccessToken({
        mailboxId: "mailbox-4",
        provider: "gmail",
        credentials: { googleClientId: "id", googleClientSecret: "secret" },
      }),
    ).rejects.toThrow(/invalid_grant/);
  });

  it("returns null when the mailbox has no credentials at all", async () => {
    const db = createDbStub();
    const store = createMailboxCredentialStore(db as never, SECRET);

    await expect(
      store.getUsableAccessToken({
        mailboxId: "missing",
        provider: "gmail",
        credentials: {},
      }),
    ).resolves.toBeNull();
  });
});
