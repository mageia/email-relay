import { describe, expect, it } from "vitest";

import { parseOutlookOauthState, signOutlookOauthState } from "./oauth-state";

describe("outlook oauth state", () => {
  it("round-trips the state payload", async () => {
    const secret = "outlook-oauth-state-secret";
    const state = await signOutlookOauthState(secret, {
      provider: "outlook",
      redirectTo: "/mailboxes",
    });

    await expect(parseOutlookOauthState(secret, state)).resolves.toMatchObject({
      provider: "outlook",
    });
  });
});
