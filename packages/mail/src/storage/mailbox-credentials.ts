import { and, eq } from "drizzle-orm";
import { mailboxCredential } from "@email-relay/db/schema/provider";

import { openValue, sealValue } from "../crypto/seal";
import { refreshGoogleAccessToken } from "../gmail/refresh";
import { refreshOutlookAccessToken } from "../outlook/refresh";

/**
 * Refresh a token this long before it actually expires, so a token does not lapse
 * mid-sync while requests are still in flight.
 */
const EXPIRY_SKEW_MS = 5 * 60 * 1000;

export type MailboxTokens = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
};

export function isAccessTokenExpired(expiresAt: Date | null | undefined, now = Date.now()) {
  if (!expiresAt) {
    return false;
  }

  return expiresAt.getTime() - EXPIRY_SKEW_MS <= now;
}

export function createMailboxCredentialStore(db: any, secret: string) {
  const store = {
    async saveOauthTokens(input: {
      mailboxId: string;
      provider: string;
      accessToken: string;
      refreshToken?: string | null;
      expiresAt?: Date;
      scope?: string;
      tokenType?: string;
    }) {
      const accessTokenSealed = await sealValue(secret, input.accessToken);
      const refreshTokenSealed = input.refreshToken
        ? await sealValue(secret, input.refreshToken)
        : null;

      const values = {
        mailboxId: input.mailboxId,
        provider: input.provider,
        accessTokenSealed,
        expiresAt: input.expiresAt,
        scope: input.scope,
        tokenType: input.tokenType,
      };

      // Upsert keyed on (mailboxId, provider): the table previously grew by one row
      // per authorization and readers had to scan it in full to find the newest.
      await db
        .insert(mailboxCredential)
        .values({ ...values, refreshTokenSealed })
        .onConflictDoUpdate({
          target: [mailboxCredential.mailboxId, mailboxCredential.provider],
          set: {
            ...values,
            // Google omits refresh_token on refresh responses, so never overwrite a
            // stored refresh token with null.
            ...(refreshTokenSealed ? { refreshTokenSealed } : {}),
            updatedAt: new Date(),
          },
        });
    },

    /**
     * Reads the stored tokens for a mailbox. `provider` should be supplied when
     * known: the unique key is (mailboxId, provider), so omitting it would return
     * an arbitrary row if a mailbox ever held credentials for more than one.
     */
    async readOauthTokens(mailboxId: string, provider?: string): Promise<MailboxTokens | null> {
      const [row] = await db
        .select()
        .from(mailboxCredential)
        .where(
          provider
            ? and(
                eq(mailboxCredential.mailboxId, mailboxId),
                eq(mailboxCredential.provider, provider),
              )
            : eq(mailboxCredential.mailboxId, mailboxId),
        )
        .limit(1);

      if (!row?.accessTokenSealed) {
        return null;
      }

      return {
        accessToken: await openValue(secret, row.accessTokenSealed),
        refreshToken: row.refreshTokenSealed
          ? await openValue(secret, row.refreshTokenSealed)
          : null,
        expiresAt: row.expiresAt ?? null,
      };
    },

    /**
     * Returns a usable access token, refreshing it first when it is at or near
     * expiry. Without this the stored refresh token was never used and every
     * mailbox broke roughly an hour after authorization.
     *
     * IMAP mailboxes store the account password in the access token column and
     * have no refresh token, so they pass through untouched.
     */
    async getUsableAccessToken(input: {
      mailboxId: string;
      provider: "gmail" | "outlook" | "imap";
      credentials: {
        googleClientId?: string;
        googleClientSecret?: string;
        microsoftClientId?: string;
        microsoftClientSecret?: string;
      };
      now?: number;
    }): Promise<string | null> {
      const tokens = await store.readOauthTokens(input.mailboxId, input.provider);
      if (!tokens?.accessToken) {
        return null;
      }

      if (input.provider === "imap") {
        return tokens.accessToken;
      }

      if (!isAccessTokenExpired(tokens.expiresAt, input.now)) {
        return tokens.accessToken;
      }

      if (!tokens.refreshToken) {
        throw new Error(
          `invalid_grant: mailbox ${input.mailboxId} access token expired and no refresh token is stored`,
        );
      }

      if (input.provider === "gmail") {
        const { googleClientId, googleClientSecret } = input.credentials;
        if (!googleClientId || !googleClientSecret) {
          throw new Error("Missing Google OAuth client configuration for token refresh");
        }

        const refreshed = await refreshGoogleAccessToken({
          refreshToken: tokens.refreshToken,
          clientId: googleClientId,
          clientSecret: googleClientSecret,
        });

        await store.saveOauthTokens({
          mailboxId: input.mailboxId,
          provider: "gmail",
          accessToken: refreshed.accessToken,
          refreshToken: refreshed.refreshToken ?? tokens.refreshToken,
          expiresAt: refreshed.expiresAt,
          scope: refreshed.scope,
          tokenType: refreshed.tokenType,
        });

        return refreshed.accessToken;
      }

      const { microsoftClientId, microsoftClientSecret } = input.credentials;
      if (!microsoftClientId || !microsoftClientSecret) {
        throw new Error("Missing Microsoft OAuth client configuration for token refresh");
      }

      const refreshed = await refreshOutlookAccessToken({
        refreshToken: tokens.refreshToken,
        clientId: microsoftClientId,
        clientSecret: microsoftClientSecret,
      });

      await store.saveOauthTokens({
        mailboxId: input.mailboxId,
        provider: "outlook",
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken ?? tokens.refreshToken,
        expiresAt: refreshed.expiresAt,
        scope: refreshed.scope,
        tokenType: refreshed.tokenType,
      });

      return refreshed.accessToken;
    },
  };

  return store;
}
