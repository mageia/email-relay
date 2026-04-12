import { mailboxCredential } from "@email-relay/db/schema/provider";

import { openValue, sealValue } from "../crypto/seal";

export function createMailboxCredentialStore(db: any, secret: string) {
  return {
    async saveOauthTokens(input: {
      mailboxId: string;
      provider: string;
      accessToken: string;
      refreshToken?: string;
      expiresAt?: Date;
      scope?: string;
      tokenType?: string;
    }) {
      const values = {
        mailboxId: input.mailboxId,
        provider: input.provider,
        accessTokenSealed: await sealValue(secret, input.accessToken),
        refreshTokenSealed: input.refreshToken ? await sealValue(secret, input.refreshToken) : null,
        expiresAt: input.expiresAt,
        scope: input.scope,
        tokenType: input.tokenType,
      };

      await db.insert(mailboxCredential).values(values);
    },

    async readOauthTokens(mailboxId: string) {
      const rows = await db.select().from(mailboxCredential);
      const row = [...rows]
        .reverse()
        .find(
        (entry: { mailboxId: string; accessTokenSealed?: string | null; refreshTokenSealed?: string | null; expiresAt?: Date | null }) =>
          entry.mailboxId === mailboxId,
        );

      if (!row?.accessTokenSealed) {
        return null;
      }

      return {
        accessToken: await openValue(secret, row.accessTokenSealed),
        refreshToken: row.refreshTokenSealed ? await openValue(secret, row.refreshTokenSealed) : null,
        expiresAt: row.expiresAt,
      };
    },
  };
}
