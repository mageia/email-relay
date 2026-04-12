import { describe, expect, it } from "vitest";

import { normalizeGmailMessage } from "./message";

describe("normalizeGmailMessage", () => {
  it("maps a Gmail FULL payload into the inbox storage shape", () => {
    const normalized = normalizeGmailMessage({
      id: "gmail-message-1",
      threadId: "thread-1",
      labelIds: ["INBOX"],
      payload: {
        headers: [
          { name: "Subject", value: "Hello" },
          { name: "From", value: "Sender <sender@example.com>" },
        ],
        mimeType: "text/plain",
        body: { data: Buffer.from("body text").toString("base64url") },
      },
      internalDate: String(Date.UTC(2026, 3, 12)),
      snippet: "body text",
      historyId: "12345",
    });

    expect(normalized.subject).toBe("Hello");
    expect(normalized.bodyText).toContain("body text");
    expect(normalized.providerMessageId).toBe("gmail-message-1");
  });
});
