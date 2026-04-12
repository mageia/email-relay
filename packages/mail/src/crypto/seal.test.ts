import { describe, expect, it } from "vitest";

import { openValue, sealValue } from "./seal";

describe("sealValue", () => {
  it("round-trips a refresh token with the configured secret", async () => {
    const secret = "0123456789abcdef0123456789abcdef";
    const sealed = await sealValue(secret, "refresh-token-value");

    expect(sealed).not.toContain("refresh-token-value");
    await expect(openValue(secret, sealed)).resolves.toBe("refresh-token-value");
  });
});
