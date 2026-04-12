import { describe, expect, it } from "vitest";

import { selectStaleMailboxAlertCandidates, toSyncAlertInput } from "./alerts";

describe("toSyncAlertInput", () => {
  it("promotes auth-expired failures to high-severity alerts", () => {
    expect(
      toSyncAlertInput({
        mailboxId: "mailbox-1",
        category: "auth-expired",
        detail: "refresh token invalid",
      }),
    ).toMatchObject({
      severity: "high",
      title: "邮箱授权失效",
    });
  });
});

describe("selectStaleMailboxAlertCandidates", () => {
  it("filters out mailboxes that already have an open stale-sync alert", () => {
    expect(
      selectStaleMailboxAlertCandidates({
        staleMailboxes: [
          {
            mailboxId: "mailbox-1",
            address: "first@example.com",
            lastSuccessfulSyncAt: new Date("2026-04-12T09:00:00.000Z"),
          },
          {
            mailboxId: "mailbox-2",
            address: "second@example.com",
            lastSuccessfulSyncAt: new Date("2026-04-12T08:30:00.000Z"),
          },
        ],
        openAlertMailboxIds: ["mailbox-2", null, undefined],
      }),
    ).toEqual([
      {
        mailboxId: "mailbox-1",
        address: "first@example.com",
        lastSuccessfulSyncAt: new Date("2026-04-12T09:00:00.000Z"),
      },
    ]);
  });
});
