import { MICROSOFT_TOKEN_URL, OUTLOOK_SCOPES } from "./constants";

/**
 * Exchanges a refresh token for a new Outlook access token.
 *
 * Microsoft rotates refresh tokens, so the response's refresh_token must be
 * persisted when present or the next refresh will fail.
 */
export async function refreshOutlookAccessToken(input: {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
}) {
  const response = await fetch(MICROSOFT_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: input.clientId,
      client_secret: input.clientSecret,
      refresh_token: input.refreshToken,
      grant_type: "refresh_token",
      scope: OUTLOOK_SCOPES.join(" "),
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Outlook token refresh failed: ${response.status} ${detail}`);
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
