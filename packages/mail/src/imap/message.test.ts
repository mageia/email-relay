import { describe, expect, it } from "vitest";

import { normalizeImapMessage } from "./message";

describe("normalizeImapMessage", () => {
  it("parses a raw MIME message with addresses and attachments", async () => {
    const raw = [
      "From: \"Sender\" <sender@example.com>",
      "To: Admin <admin@example.com>",
      "Cc: Carbon <carbon@example.com>",
      "Subject: IMAP hello",
      "Date: Sun, 12 Apr 2026 08:00:00 +0000",
      "Message-ID: <message-id@example.com>",
      "MIME-Version: 1.0",
      "Content-Type: multipart/mixed; boundary=\"mix\"",
      "",
      "--mix",
      "Content-Type: multipart/alternative; boundary=\"alt\"",
      "",
      "--alt",
      "Content-Type: text/plain; charset=\"UTF-8\"",
      "",
      "hello from imap text",
      "",
      "--alt",
      "Content-Type: text/html; charset=\"UTF-8\"",
      "",
      "<p>hello from imap html</p>",
      "",
      "--alt--",
      "",
      "--mix",
      "Content-Type: application/octet-stream",
      "Content-Disposition: attachment; filename=\"note.txt\"",
      "Content-ID: <note@example.com>",
      "Content-Transfer-Encoding: base64",
      "",
      "SGVsbG8=",
      "",
      "--mix--",
    ].join("\r\n");

    const normalized = await normalizeImapMessage({
      uid: 42,
      raw,
      folderId: "INBOX",
      internalDate: new Date("2026-04-12T08:00:00Z"),
    });

    expect(normalized.subject).toBe("IMAP hello");
    expect(normalized.bodyText).toContain("hello from imap text");
    expect(normalized.bodyHtml).toContain("<p>hello from imap html</p>");
    expect(normalized.providerMessageId).toBe("INBOX:42");
    expect(normalized.snippet).toContain("hello from imap");
    expect(normalized.internetMessageId).toBe("<message-id@example.com>");

    const from = JSON.parse(normalized.fromJson);
    const to = JSON.parse(normalized.toJson);
    const cc = JSON.parse(normalized.ccJson);

    expect(from).toEqual([{ address: "sender@example.com", name: "Sender" }]);
    expect(to[0].address).toBe("admin@example.com");
    expect(cc[0].address).toBe("carbon@example.com");

    expect(normalized.attachments).toHaveLength(1);
    expect(normalized.attachments[0]).toEqual(
      expect.objectContaining({
        filename: "note.txt",
        mimeType: "application/octet-stream",
        inline: false,
        cid: "<note@example.com>",
      }),
    );
    expect(normalized.attachments[0].size).toBeGreaterThan(0);
  });
});
