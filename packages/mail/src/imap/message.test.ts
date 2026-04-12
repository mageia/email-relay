import { describe, expect, it } from "vitest";

import { normalizeImapMessage } from "./message";

describe("normalizeImapMessage", () => {
  it("parses a raw MIME message into the inbox shape", async () => {
    const raw = [
      "From: Sender <sender@example.com>",
      "To: Admin <admin@example.com>",
      "Subject: IMAP hello",
      "Date: Sun, 12 Apr 2026 08:00:00 +0000",
      "Content-Type: text/plain; charset=UTF-8",
      "",
      "hello from imap",
      "",
    ].join("\r\n");

    const normalized = await normalizeImapMessage({
      uid: 42,
      raw,
      folderId: "INBOX",
      internalDate: new Date("2026-04-12T08:00:00Z"),
    });

    expect(normalized.subject).toBe("IMAP hello");
    expect(normalized.bodyText).toContain("hello from imap");
    expect(normalized.providerMessageId).toBe("INBOX:42");
  });
});
