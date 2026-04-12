import type { MailSyncPayload } from "@email-relay/mail";
import { describe, expect, it, vi } from "vitest";

import { recordMailboxSyncSuccess, shouldRecordMailboxSyncSuccess } from "./sync-status";

describe("shouldRecordMailboxSyncSuccess", () => {
  it.each<readonly [MailSyncPayload, boolean]>([
    [{ provider: "gmail", mailboxId: "m1", reason: "gmail-initial" }, true],
    [{ provider: "gmail", mailboxId: "m1", reason: "gmail-history" }, true],
    [{ provider: "gmail", mailboxId: "m1", reason: "gmail-backfill" }, true],
    [{ provider: "gmail", mailboxId: "m1", reason: "gmail-renew-watch" }, false],
    [{ provider: "outlook", mailboxId: "m1", reason: "outlook-initial" }, true],
    [{ provider: "outlook", mailboxId: "m1", reason: "outlook-delta" }, true],
    [{ provider: "outlook", mailboxId: "m1", reason: "outlook-backfill" }, true],
    [{ provider: "outlook", mailboxId: "m1", reason: "outlook-renew-subscription" }, false],
    [{ provider: "imap", mailboxId: "m1", reason: "imap-initial" }, true],
    [{ provider: "imap", mailboxId: "m1", reason: "imap-poll" }, true],
    [{ provider: "imap", mailboxId: "m1", reason: "imap-backfill" }, true],
  ])("returns %s for %o", (payload, expected) => {
    expect(shouldRecordMailboxSyncSuccess(payload)).toBe(expected);
  });
});

describe("recordMailboxSyncSuccess", () => {
  it("updates mailbox sync timestamps to the same successful time", async () => {
    const where = vi.fn();
    const set = vi.fn(() => ({ where }));
    const update = vi.fn(() => ({ set }));
    const db = { update };
    const now = new Date("2026-04-12T12:00:00.000Z");

    await recordMailboxSyncSuccess(db as never, "mailbox-1", now);

    expect(update).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith({
      lastSyncAt: now,
      lastSuccessfulSyncAt: now,
    });
    expect(where).toHaveBeenCalledTimes(1);
  });
});
