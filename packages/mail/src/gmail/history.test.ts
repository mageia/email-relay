import { describe, expect, it } from "vitest";

import { decodeGmailPushBody } from "./history";

describe("decodeGmailPushBody", () => {
  it("decodes Pub/Sub data into email + historyId", () => {
    const encoded = Buffer.from(
      JSON.stringify({ emailAddress: "user@example.com", historyId: "999" }),
    ).toString("base64");

    expect(
      decodeGmailPushBody({
        message: { data: encoded },
        subscription: "projects/acme/subscriptions/gmail-watch",
      }),
    ).toEqual({ emailAddress: "user@example.com", historyId: "999" });
  });
});
