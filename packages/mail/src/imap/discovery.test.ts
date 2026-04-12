import { describe, expect, it } from "vitest";

import { applyDiscoveryFallbacks } from "./discovery";

describe("applyDiscoveryFallbacks", () => {
  it("falls back to imap.<domain> and port 993 when no provider preset exists", () => {
    expect(applyDiscoveryFallbacks("example.com")).toEqual({
      host: "imap.example.com",
      port: 993,
      secure: true,
      authType: "password",
    });
  });
});
