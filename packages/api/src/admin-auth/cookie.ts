import { ADMIN_SESSION_COOKIE } from "./constants";

export function parseAdminSessionCookie(header: string | null) {
  if (!header) {
    return null;
  }

  const parts = header.split(/;\s*/);
  const match = parts.find((part) => part.startsWith(`${ADMIN_SESSION_COOKIE}=`));
  return match ? decodeURIComponent(match.split("=")[1] ?? "") : null;
}

export function createAdminSessionCookie(token: string, expiresAt: Date) {
  return `${ADMIN_SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Expires=${expiresAt.toUTCString()}`;
}

export function clearAdminSessionCookie() {
  return `${ADMIN_SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}
