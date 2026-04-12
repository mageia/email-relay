import { describe, expect, it } from "vitest";

import { MailSyncPayloadSchema } from "./payload";

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
