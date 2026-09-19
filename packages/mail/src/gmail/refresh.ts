import { GOOGLE_TOKEN_URL } from "./constants";

/**
 * Exchanges a long-lived refresh token for a new access token.
 *
 * Google does not return a new refresh token on this call, so callers must keep
 * the existing one. A revoked or expired grant surfaces as `invalid_grant`, which
 * classifySyncError maps to the non-retryable `auth-expired` category.
 */
export async function refreshGoogleAccessToken(input: {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
}) {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: input.clientId,
      client_secret: input.clientSecret,
      refresh_token: input.refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Google token refresh failed: ${response.status} ${detail}`);
  }

  const body = (await response.json()) as {
    access_token: string;
    expires_in: number;
    scope?: string;
    token_type?: string;
    refresh_token?: string;
  };

  return {
    accessToken: body.access_token,
    expiresAt: new Date(Date.now() + body.expires_in * 1000),
    scope: body.scope,
    tokenType: body.token_type,
    refreshToken: body.refresh_token,
  };
}
