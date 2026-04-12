import { IMAP_PROVIDER_PRESETS, IMAP_TLS_PORT } from "./constants";

export function applyDiscoveryFallbacks(domain: string) {
  const preset = IMAP_PROVIDER_PRESETS[domain];
  if (preset) {
    return preset;
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
