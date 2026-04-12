import { describe, expect, it } from "vitest";

import { normalizeOutlookMessage } from "./message";

describe("normalizeOutlookMessage", () => {
  it("maps a Graph message into the inbox storage shape", () => {
    const normalized = normalizeOutlookMessage({
      id: "graph-message-1",
      subject: "Quarterly update",
      bodyPreview: "Preview text",
      body: { contentType: "html", content: "<p>Hello</p>" },
      receivedDateTime: "2026-04-12T06:00:00Z",
      sentDateTime: "2026-04-12T05:58:00Z",
      from: { emailAddress: { address: "sender@example.com", name: "Sender" } },
      toRecipients: [{ emailAddress: { address: "admin@example.com", name: "Admin" } }],
      ccRecipients: [],
      isRead: false,
      internetMessageId: "<message@example.com>",
    });

    expect(normalized.subject).toBe("Quarterly update");
    expect(normalized.bodyHtml).toContain("Hello");
    expect(normalized.isRead).toBe(false);
  });
});
