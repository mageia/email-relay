import { describe, expect, it } from "vitest";

import { MailSyncPayloadSchema, resolveSyncRange } from "./payload";

describe("MailSyncPayloadSchema", () => {
  it("accepts a Gmail history sync payload", () => {
    expect(
      MailSyncPayloadSchema.parse({
        provider: "gmail",
        mailboxId: "mailbox-1",
        reason: "gmail-history",
        historyId: "1234567890",
      }),
    ).toMatchObject({ provider: "gmail", mailboxId: "mailbox-1" });
  });
});

it("accepts an Outlook delta payload", () => {
  expect(
    MailSyncPayloadSchema.parse({
      provider: "outlook",
      mailboxId: "mailbox-2",
      reason: "outlook-delta",
      deltaLink: "https://graph.microsoft.com/v1.0/me/messages/delta?...",
    }),
  ).toMatchObject({ provider: "outlook", mailboxId: "mailbox-2" });
});

it("accepts an IMAP poll payload", () => {
  expect(
    MailSyncPayloadSchema.parse({
      provider: "imap",
      mailboxId: "mailbox-3",
      reason: "imap-poll",
      folderIds: ["INBOX"],
    }),
  ).toMatchObject({ provider: "imap", mailboxId: "mailbox-3" });
});

describe("backfill range round-trip", () => {
  // Regression: the schema previously omitted rangeStart/rangeEnd, so parse()
  // stripped them and every backfill silently ignored the requested window.
  it.each(["gmail", "outlook", "imap"] as const)(
    "preserves the requested range for a %s backfill",
    (provider) => {
      const parsed = MailSyncPayloadSchema.parse({
        provider,
        mailboxId: "mailbox-1",
        reason: `${provider}-backfill`,
        rangeStart: "2026-04-01T00:00:00.000Z",
        rangeEnd: "2026-04-07T00:00:00.000Z",
      });

      expect(parsed).toMatchObject({
        rangeStart: "2026-04-01T00:00:00.000Z",
        rangeEnd: "2026-04-07T00:00:00.000Z",
      });
    },
  );

  it("rejects a non-ISO range", () => {
    expect(
      MailSyncPayloadSchema.safeParse({
        provider: "gmail",
        mailboxId: "mailbox-1",
        reason: "gmail-backfill",
        rangeStart: "2026/04/01",
        rangeEnd: "2026-04-07T00:00:00.000Z",
      }).success,
    ).toBe(false);
  });

  it("carries the Outlook pagination nextLink", () => {
    expect(
      MailSyncPayloadSchema.parse({
        provider: "outlook",
        mailboxId: "mailbox-2",
        reason: "outlook-backfill",
        nextLink: "https://graph.microsoft.com/v1.0/me/messages?$skip=50",
        rangeStart: "2026-04-01T00:00:00.000Z",
        rangeEnd: "2026-04-07T00:00:00.000Z",
      }),
    ).toMatchObject({
      nextLink: "https://graph.microsoft.com/v1.0/me/messages?$skip=50",
    });
  });
});

describe("resolveSyncRange", () => {
  it("converts a complete ISO range into Dates", () => {
    expect(
      resolveSyncRange({
        rangeStart: "2026-04-01T00:00:00.000Z",
        rangeEnd: "2026-04-07T00:00:00.000Z",
      }),
    ).toEqual({
      rangeStart: new Date("2026-04-01T00:00:00.000Z"),
      rangeEnd: new Date("2026-04-07T00:00:00.000Z"),
    });
  });

  it("returns null when the range is absent or half-specified", () => {
    expect(resolveSyncRange({})).toBeNull();
    expect(resolveSyncRange({ rangeStart: "2026-04-01T00:00:00.000Z" })).toBeNull();
    expect(resolveSyncRange({ rangeEnd: "2026-04-07T00:00:00.000Z" })).toBeNull();
  });

  it("returns null for an unparseable bound", () => {
    expect(
      resolveSyncRange({ rangeStart: "not-a-date", rangeEnd: "2026-04-07T00:00:00.000Z" }),
    ).toBeNull();
  });
});
