import { describe, expect, it, vi } from "vitest";

import { applyDiscoveryFallbacks, discoverImapSettings } from "./discovery";

describe("applyDiscoveryFallbacks", () => {
  it("falls back to imap.<domain> and port 993 when no provider preset exists", () => {
    expect(applyDiscoveryFallbacks("example.com")).toEqual({
      host: "imap.example.com",
      port: 993,
      secure: true,
      authType: "password",
    });
  });

  it("uses the preset for a known provider", () => {
    expect(applyDiscoveryFallbacks("gmail.com")).toEqual({
      host: "imap.gmail.com",
      port: 993,
      secure: true,
      authType: "app-password",
    });
  });

  it("matches the domain case-insensitively", () => {
    expect(applyDiscoveryFallbacks("GMAIL.COM").host).toBe("imap.gmail.com");
  });
});

describe("discoverImapSettings", () => {
  /**
   * A preset must win over SRV. SRV only yields host/port, so trusting it for a
   * provider like Gmail would silently downgrade authType to "password" and the
   * connect form would stop telling the user an app password is required.
   */
  it("prefers a known preset over SRV records", async () => {
    const resolveSrv = vi.fn().mockResolvedValue([
      { priority: 1, name: "srv.example.net", port: 1993 },
    ]);

    const result = await discoverImapSettings({ domain: "gmail.com", resolveSrv });

    expect(result).toEqual({
      host: "imap.gmail.com",
      port: 993,
      secure: true,
      authType: "app-password",
      source: "preset",
    });
    expect(resolveSrv).not.toHaveBeenCalled();
  });

  it("uses SRV records for an unknown domain", async () => {
    const resolveSrv = vi.fn().mockResolvedValue([
      { priority: 10, name: "backup.example.net", port: 993 },
      { priority: 1, name: "primary.example.net", port: 1993 },
    ]);

    const result = await discoverImapSettings({ domain: "example.com", resolveSrv });

    // Lowest priority number wins.
    expect(result).toMatchObject({
      host: "primary.example.net",
      port: 1993,
      source: "srv",
    });
  });

  it("falls back when SRV yields nothing", async () => {
    const result = await discoverImapSettings({
      domain: "example.com",
      resolveSrv: vi.fn().mockResolvedValue([]),
    });

    expect(result).toMatchObject({ host: "imap.example.com", source: "fallback" });
  });
});
