export const IMAP_PROVIDER = "imap";
export const IMAP_TLS_PORT = 993;
export const IMAP_STARTTLS_PORT = 143;

export const IMAP_PROVIDER_PRESETS: Record<
  string,
  { host: string; port: number; secure: boolean; authType: "password" | "app-password" }
> = {
  "qq.com": {
    host: "imap.qq.com",
    port: 993,
    secure: true,
    authType: "app-password",
  },
  "163.com": {
    host: "imap.163.com",
    port: 993,
    secure: true,
    authType: "app-password",
  },
  "outlook.com": {
    host: "outlook.office365.com",
    port: 993,
    secure: true,
    authType: "password",
  },
};
