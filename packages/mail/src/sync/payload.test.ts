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
