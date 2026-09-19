import { describe, expect, it, vi } from "vitest";

import { upsertNormalizedMessage } from "./message-upserts";

const INPUT = {
  mailboxId: "mailbox-1",
  providerMessageId: "gmail-100",
  internetMessageId: "<a@example.com>",
  subject: "Hello",
  snippet: "Hello there",
  fromJson: '[{"address":"a@example.com"}]',
  toJson: "[]",
  ccJson: "[]",
  bodyHtml: "<p>Hello</p>",
  bodyText: "Hello",
  isRead: false,
  receivedAt: new Date("2026-04-12T10:00:00.000Z"),
  sentAt: null,
};

describe("upsertNormalizedMessage", () => {
  // Regression: this was a plain insert, so redelivered queue messages created
  // duplicate rows and duplicate FTS entries.
  it("upserts on the mailbox + provider message id pair", async () => {
    const onConflictDoUpdate = vi.fn(() => ({
      returning: async () => [{ id: "message-1" }],
    }));
    const values = vi.fn(() => ({ onConflictDoUpdate }));
    const insert = vi.fn(() => ({ values }));

    const id = await upsertNormalizedMessage({ insert } as never, INPUT);

    expect(id).toBe("message-1");
    expect(onConflictDoUpdate).toHaveBeenCalledTimes(1);

    const conflictArgs = onConflictDoUpdate.mock.calls[0]?.[0] as {
      target: unknown[];
      set: Record<string, unknown>;
    };
    expect(conflictArgs.target).toHaveLength(2);
    // Body and flags must be refreshed so a re-sync picks up edits such as isRead.
    expect(conflictArgs.set).toMatchObject({
      subject: INPUT.subject,
      bodyText: INPUT.bodyText,
      isRead: INPUT.isRead,
      receivedAt: INPUT.receivedAt,
    });
  });

  it("falls back to a lookup when RETURNING yields no row", async () => {
    const insert = vi.fn(() => ({
      values: () => ({
        onConflictDoUpdate: () => ({
          returning: async () => [],
        }),
      }),
    }));
    const limit = vi.fn(async () => [{ id: "existing-1" }]);
    const select = vi.fn(() => ({
      from: () => ({ where: () => ({ limit }) }),
    }));

    await expect(upsertNormalizedMessage({ insert, select } as never, INPUT)).resolves.toBe(
      "existing-1",
    );
    expect(limit).toHaveBeenCalledTimes(1);
  });

  it("returns null when neither the upsert nor the lookup finds a row", async () => {
    const insert = vi.fn(() => ({
      values: () => ({
        onConflictDoUpdate: () => ({ returning: async () => [] }),
      }),
    }));
    const select = vi.fn(() => ({
      from: () => ({ where: () => ({ limit: async () => [] }) }),
    }));

    await expect(upsertNormalizedMessage({ insert, select } as never, INPUT)).resolves.toBeNull();
  });
});
