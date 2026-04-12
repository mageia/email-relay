import { discoverImapSettings } from "./discovery";
import { normalizeImapFolders } from "./folders";
import { validateImapLogin } from "./client";

export async function validateImapMailbox(input: {
  email: string;
  username: string;
  password: string;
  host?: string;
  port?: number;
  secure?: boolean;
}) {
  const domain = input.email.split("@")[1];
  if (!domain) {
    throw new Error("Invalid email address");
  }

  const discovered = input.host
    ? {
        host: input.host,
        port: input.port ?? 993,
        secure: input.secure ?? true,
        authType: "password" as const,
        source: "manual" as const,
      }
    : await discoverImapSettings({ domain });

  const result = await validateImapLogin({
    host: discovered.host,
    port: input.port ?? discovered.port,
    secure: input.secure ?? discovered.secure,
    username: input.username,
    password: input.password,
  });

  return {
    settings: {
      host: discovered.host,
      port: input.port ?? discovered.port,
      secure: input.secure ?? discovered.secure,
      authType: discovered.authType,
      username: input.username,
      discoverySource: discovered.source,
    },
    folders: normalizeImapFolders(result.folders),
  };
}
