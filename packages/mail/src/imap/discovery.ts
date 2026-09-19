import { IMAP_PROVIDER_PRESETS, IMAP_TLS_PORT } from "./constants";

export function applyDiscoveryFallbacks(domain: string) {
  const preset = IMAP_PROVIDER_PRESETS[domain.toLowerCase()];
  if (preset) {
    return {
      host: preset.host,
      port: preset.port,
      secure: preset.secure,
      authType: preset.authType,
    };
  }

  return {
    host: `imap.${domain}`,
    port: IMAP_TLS_PORT,
    secure: true,
    authType: "password" as const,
  };
}

export async function discoverImapSettings(input: {
  domain: string;
  resolveSrv?: (
    record: string,
  ) => Promise<Array<{ priority: number; name: string; port: number }>>;
}) {
  /* A known preset wins over SRV: SRV only yields host/port, so trusting it for a
     provider like Gmail would silently downgrade authType to "password" and the
     UI would stop telling the user an app password is required. */
  const preset = IMAP_PROVIDER_PRESETS[input.domain.toLowerCase()];
  if (preset) {
    return {
      host: preset.host,
      port: preset.port,
      secure: preset.secure,
      authType: preset.authType,
      source: "preset" as const,
    };
  }

  const srvRecords = input.resolveSrv ? await input.resolveSrv(`_imaps._tcp.${input.domain}`) : [];
  if (srvRecords.length > 0) {
    const sorted = [...srvRecords].sort((left, right) => left.priority - right.priority);
    return {
      host: sorted[0]?.name ?? `imap.${input.domain}`,
      port: sorted[0]?.port ?? IMAP_TLS_PORT,
      secure: true,
      authType: "password" as const,
      source: "srv" as const,
    };
  }

  return {
    ...applyDiscoveryFallbacks(input.domain),
    source: "fallback" as const,
  };
}
