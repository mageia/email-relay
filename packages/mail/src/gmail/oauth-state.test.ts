import { describe, expect, it } from "vitest";

import { parseOauthState, signOauthState } from "./oauth-state";

describe("gmail oauth state", () => {
  it("signs and verifies mailbox connect state", async () => {
    const secret = "gmail-oauth-state-secret";
    const state = await signOauthState(secret, {
      redirectTo: "/mailboxes/connect",
      provider: "gmail",
    });

    await expect(parseOauthState(secret, state)).resolves.toMatchObject({ provider: "gmail" });
  });
});
