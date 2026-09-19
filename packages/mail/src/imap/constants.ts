export const IMAP_PROVIDER = "imap";
export const IMAP_TLS_PORT = 993;
export const IMAP_STARTTLS_PORT = 143;

/**
 * Known IMAP endpoints.
 *
 * `authType: "app-password"` means the provider rejects the account's normal
 * password over IMAP and requires a separately generated app password. That flag
 * drives the setup hint shown in the connect form, so getting it right matters
 * more than the host itself (which the `imap.<domain>` fallback usually guesses
 * correctly).
 */
export const IMAP_PROVIDER_PRESETS: Record<
  string,
  {
    host: string;
    port: number;
    secure: boolean;
    authType: "password" | "app-password";
    /** Where the user generates an app password, shown in the connect form. */
    appPasswordUrl?: string;
    /** Provider-specific setup note, shown verbatim to the user. */
    note?: string;
  }
> = {
  "gmail.com": {
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    authType: "app-password",
    appPasswordUrl: "https://myaccount.google.com/apppasswords",
    note: "需先开启两步验证，然后生成应用专用密码（16 位）。普通账号密码无法用于 IMAP。",
  },
  "googlemail.com": {
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    authType: "app-password",
    appPasswordUrl: "https://myaccount.google.com/apppasswords",
    note: "需先开启两步验证，然后生成应用专用密码（16 位）。普通账号密码无法用于 IMAP。",
  },
  "qq.com": {
    host: "imap.qq.com",
    port: 993,
    secure: true,
    authType: "app-password",
    appPasswordUrl: "https://service.mail.qq.com/",
    note: "需在邮箱设置中开启 IMAP 服务并获取授权码，用授权码而非登录密码。",
  },
  "163.com": {
    host: "imap.163.com",
    port: 993,
    secure: true,
    authType: "app-password",
    appPasswordUrl: "https://mail.163.com/",
    note: "需在邮箱设置中开启 IMAP 服务并设置客户端授权密码。",
  },
  "126.com": {
    host: "imap.126.com",
    port: 993,
    secure: true,
    authType: "app-password",
    note: "需在邮箱设置中开启 IMAP 服务并设置客户端授权密码。",
  },
  "outlook.com": {
    host: "outlook.office365.com",
    port: 993,
    secure: true,
    authType: "password",
  },
  "hotmail.com": {
    host: "outlook.office365.com",
    port: 993,
    secure: true,
    authType: "password",
  },
  "icloud.com": {
    host: "imap.mail.me.com",
    port: 993,
    secure: true,
    authType: "app-password",
    appPasswordUrl: "https://appleid.apple.com/account/manage",
    note: "需在 Apple ID 设置中生成 App 专用密码。",
  },
  "yahoo.com": {
    host: "imap.mail.yahoo.com",
    port: 993,
    secure: true,
    authType: "app-password",
    note: "需在账号安全设置中生成应用专用密码。",
  },
};

/** Preset lookup for a full email address; returns null for unknown domains. */
export function findImapPreset(email: string) {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) {
    return null;
  }

  return IMAP_PROVIDER_PRESETS[domain] ?? null;
}
