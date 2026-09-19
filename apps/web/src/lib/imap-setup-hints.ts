/**
 * Client-side copy of the IMAP provider hints.
 *
 * Deliberately not imported from `@email-relay/mail`: that package pulls in the
 * IMAP protocol client, which depends on `cloudflare:sockets` and does not belong
 * in the browser bundle. Only the user-facing setup guidance lives here; the
 * authoritative host/port used for the actual connection still comes from the
 * server's discovery step.
 */
export type ImapSetupHint = {
  /** True when the provider rejects the account password over IMAP. */
  requiresAppPassword: boolean;
  /** Where the user generates the app password. */
  appPasswordUrl?: string;
  note?: string;
};

const HINTS: Record<string, ImapSetupHint> = {
  "gmail.com": {
    requiresAppPassword: true,
    appPasswordUrl: "https://myaccount.google.com/apppasswords",
    note: "需先开启两步验证，然后生成应用专用密码（16 位）。普通账号密码无法用于 IMAP。",
  },
  "googlemail.com": {
    requiresAppPassword: true,
    appPasswordUrl: "https://myaccount.google.com/apppasswords",
    note: "需先开启两步验证，然后生成应用专用密码（16 位）。普通账号密码无法用于 IMAP。",
  },
  "qq.com": {
    requiresAppPassword: true,
    appPasswordUrl: "https://service.mail.qq.com/",
    note: "需在邮箱设置中开启 IMAP 服务并获取授权码，用授权码而非登录密码。",
  },
  "163.com": {
    requiresAppPassword: true,
    appPasswordUrl: "https://mail.163.com/",
    note: "需在邮箱设置中开启 IMAP 服务并设置客户端授权密码。",
  },
  "126.com": {
    requiresAppPassword: true,
    note: "需在邮箱设置中开启 IMAP 服务并设置客户端授权密码。",
  },
  "icloud.com": {
    requiresAppPassword: true,
    appPasswordUrl: "https://appleid.apple.com/account/manage",
    note: "需在 Apple ID 设置中生成 App 专用密码。",
  },
  "yahoo.com": {
    requiresAppPassword: true,
    note: "需在账号安全设置中生成应用专用密码。",
  },
  "outlook.com": { requiresAppPassword: false },
  "hotmail.com": { requiresAppPassword: false },
};

export function findImapSetupHint(email: string): ImapSetupHint | null {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) {
    return null;
  }

  return HINTS[domain] ?? null;
}
