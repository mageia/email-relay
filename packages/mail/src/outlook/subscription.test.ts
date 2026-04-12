import { describe, expect, it } from "vitest";

import { buildOutlookSubscriptionRequest } from "./subscription";

describe("buildOutlookSubscriptionRequest", () => {
  it("creates a message subscription payload with a client state token", () => {
    const payload = buildOutlookSubscriptionRequest({
      notificationUrl: "https://example.com/webhooks/outlook/notifications",
      clientState: "secret",
      resource: "/me/messages",
      expiresAt: new Date("2026-04-13T00:00:00Z"),
    });

    expect(payload.clientState).toBe("secret");
    expect(payload.resource).toBe("/me/messages");
  });
});
