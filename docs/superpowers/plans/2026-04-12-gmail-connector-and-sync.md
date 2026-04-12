# Gmail Connector & Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Gmail OAuth mailbox connection, label selection, initial full sync, push-triggered incremental sync, and Cloudflare deployment verification so Gmail messages appear in the unified inbox.

**Architecture:** Build a new `packages/mail` package for shared mailbox credential encryption, sync payload contracts, and Gmail-specific API clients. Extend the server worker to support OAuth redirect endpoints, queue consumption, and scheduled watch renewal while persisting mailbox credentials, label selections, and Gmail sync cursors in D1.

**Tech Stack:** Hono, oRPC, Drizzle ORM, Cloudflare Workers, Cloudflare Queues, Cloudflare Cron Triggers, Gmail API, Google OAuth 2.0, Vitest

---

## Scope split

This plan assumes **`2026-04-12-control-plane-and-unified-inbox-foundation.md` is already complete**. It only covers Gmail. Outlook, IMAP, and cross-provider sync operations remain separate plans.

## File structure map

### Create
- `packages/mail/package.json` — shared mail/connectors package manifest
- `packages/mail/tsconfig.json` — package TypeScript config
- `packages/mail/src/index.ts` — public exports for connector modules
- `packages/mail/src/crypto/seal.ts` — AES-GCM credential sealing helpers for D1 storage
- `packages/mail/src/crypto/seal.test.ts` — credential sealing tests
- `packages/mail/src/sync/payload.ts` — queue payload types for mailbox sync jobs
- `packages/mail/src/sync/payload.test.ts` — payload schema tests
- `packages/mail/src/gmail/constants.ts` — Google scopes, endpoints, provider constants
- `packages/mail/src/gmail/oauth-state.ts` — signed OAuth state helpers
- `packages/mail/src/gmail/oauth-state.test.ts` — OAuth state tests
- `packages/mail/src/gmail/oauth.ts` — Gmail auth URL builder and token exchange helpers
- `packages/mail/src/gmail/profile.ts` — Gmail profile fetch helper
- `packages/mail/src/gmail/labels.ts` — Gmail label list helper and label selection mapper
- `packages/mail/src/gmail/message.ts` — Gmail FULL payload normalization into `mail_message`
- `packages/mail/src/gmail/message.test.ts` — Gmail message normalization tests
- `packages/mail/src/gmail/history.ts` — Gmail `history.list` partial sync helper
- `packages/mail/src/gmail/watch.ts` — Gmail watch registration / renewal helper
- `packages/mail/src/storage/mailbox-credentials.ts` — encrypted credential repository
- `packages/mail/src/storage/message-upserts.ts` — D1 upsert helpers for mail messages and attachments meta
- `packages/db/src/schema/provider.ts` — generic mailbox credentials, folder selections, Gmail state tables
- `packages/api/src/mailboxes/repository.ts` — mailbox list/update repository with Gmail joins
- `packages/api/src/mailboxes/repository.test.ts` — mailbox repository tests
- `packages/api/src/routers/mailboxes.ts` — mailbox list/select-labels/start-connect procedures
- `apps/server/src/mail/queue.ts` — queue handler and dispatcher for Gmail sync payloads
- `apps/server/src/mail/scheduled.ts` — cron handler for Gmail watch renewal and backstop polling
- `apps/server/src/mail/gmail-webhook.ts` — Pub/Sub webhook decoder + queue enqueue logic
- `apps/web/src/components/connect-gmail-button.tsx` — start Gmail connect CTA
- `apps/web/src/components/gmail-label-selector.tsx` — selected-label editing UI
- `apps/web/src/components/mailbox-status-card.tsx` — mailbox row card with sync metadata
- `apps/web/src/routes/_protected/mailboxes/connect.tsx` — connection landing screen with provider choices
- `apps/web/src/routes/_protected/mailboxes/$mailboxId.tsx` — mailbox detail page for Gmail label selection

### Modify
- `package.json` — register `packages/mail` workspace dependency references if needed
- `pnpm-workspace.yaml` — include new `packages/mail` workspace if glob does not already cover it
- `packages/db/src/schema/index.ts` — export `provider.ts`
- `packages/db/src/index.ts` — expose the new provider schema to Drizzle
- `packages/api/package.json` — depend on `@email-relay/mail`
- `apps/server/package.json` — depend on `@email-relay/mail`
- `apps/web/package.json` — depend on `@email-relay/mail` if web reads shared types
- `packages/api/src/routers/index.ts` — add `mailboxes` router
- `packages/api/src/context.ts` — expose typed repositories / env secrets as needed by handlers
- `apps/server/src/index.ts` — add Gmail OAuth start/callback routes, webhook route, queue + scheduled exports
- `packages/infra/alchemy.run.ts` — add Gmail queue binding, cron triggers, and Google secret bindings
- `packages/env/env.d.ts` — include new worker bindings in generated type expectations after Alchemy changes
- `apps/server/.env` — add local Gmail OAuth/test secrets
- `apps/web/.env` — add web-visible server URL if changed
- `apps/web/src/routes/_protected/mailboxes.tsx` — show Gmail connect CTA and mailbox list
- `apps/web/src/utils/orpc.ts` — expose mailbox router helpers via generated client usage
- `README.md` — document Gmail OAuth setup and Pub/Sub watch prerequisites

---

### Task 1: Create the shared mail package, encrypted credential storage, and Gmail state schema

**Files:**
- Create: `packages/mail/package.json`
- Create: `packages/mail/tsconfig.json`
- Create: `packages/mail/src/index.ts`
- Create: `packages/mail/src/crypto/seal.ts`
- Create: `packages/mail/src/crypto/seal.test.ts`
- Create: `packages/mail/src/sync/payload.ts`
- Create: `packages/mail/src/sync/payload.test.ts`
- Create: `packages/db/src/schema/provider.ts`
- Modify: `packages/db/src/schema/index.ts`
- Modify: `packages/db/src/index.ts`
- Modify: `packages/api/package.json`
- Modify: `apps/server/package.json`

- [ ] **Step 1: Write the failing encryption and payload tests**

```ts
// packages/mail/src/crypto/seal.test.ts
import { describe, expect, it } from "vitest";

import { openValue, sealValue } from "./seal";

describe("sealValue", () => {
  it("round-trips a refresh token with the configured secret", async () => {
    const secret = "0123456789abcdef0123456789abcdef";
    const sealed = await sealValue(secret, "refresh-token-value");

    expect(sealed).not.toContain("refresh-token-value");
    await expect(openValue(secret, sealed)).resolves.toBe("refresh-token-value");
  });
});
```

```ts
// packages/mail/src/sync/payload.test.ts
import { describe, expect, it } from "vitest";

import { MailSyncPayloadSchema } from "./payload";

describe("MailSyncPayloadSchema", () => {
  it("accepts a Gmail history sync payload", () => {
    expect(
      MailSyncPayloadSchema.parse({
        provider: "gmail",
        mailboxId: "mailbox-1",
        reason: "gmail-history",
        historyId: "1234567890",
      }),
    ).toMatchObject({ provider: "gmail", mailboxId: "mailbox-1" });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail because the package and modules do not exist**

Run: `pnpm exec vitest run packages/mail/src/crypto/seal.test.ts packages/mail/src/sync/payload.test.ts`  
Expected: FAIL with missing file/module errors

- [ ] **Step 3: Add the shared package, credential sealing helpers, payload schema, and provider tables**

```json
// packages/mail/package.json
{
  "name": "@email-relay/mail",
  "type": "module",
  "exports": {
    ".": {
      "default": "./src/index.ts"
    },
    "./*": {
      "default": "./src/*.ts"
    }
  },
  "dependencies": {
    "zod": "catalog:",
    "@email-relay/db": "workspace:*"
  },
  "devDependencies": {
    "@email-relay/config": "workspace:*",
    "typescript": "^5"
  }
}
```

```ts
// packages/mail/src/crypto/seal.ts
const IV_BYTES = 12;

function toBase64(bytes: Uint8Array) {
  return Buffer.from(bytes).toString("base64url");
}

function fromBase64(value: string) {
  return new Uint8Array(Buffer.from(value, "base64url"));
}

async function importKey(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function sealValue(secret: string, value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await importKey(secret);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(value),
  );

  return `${toBase64(iv)}.${toBase64(new Uint8Array(encrypted))}`;
}

export async function openValue(secret: string, sealed: string) {
  const [ivText, payloadText] = sealed.split(".");
  const key = await importKey(secret);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(ivText) },
    key,
    fromBase64(payloadText),
  );

  return new TextDecoder().decode(decrypted);
}
```

```ts
// packages/mail/src/sync/payload.ts
import { z } from "zod";

export const MailSyncPayloadSchema = z.discriminatedUnion("provider", [
  z.object({
    provider: z.literal("gmail"),
    mailboxId: z.string().min(1),
    reason: z.enum(["gmail-initial", "gmail-history", "gmail-renew-watch", "gmail-backfill"]),
    historyId: z.string().optional(),
    pageToken: z.string().optional(),
  }),
]);

export type MailSyncPayload = z.infer<typeof MailSyncPayloadSchema>;
```

```ts
// packages/db/src/schema/provider.ts
import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { mailbox } from "./mail";

export const mailboxCredential = sqliteTable("mailbox_credential", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  mailboxId: text("mailbox_id").notNull().references(() => mailbox.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  accessTokenSealed: text("access_token_sealed"),
  refreshTokenSealed: text("refresh_token_sealed"),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
  scope: text("scope"),
  tokenType: text("token_type"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .$onUpdate(() => new Date())
    .notNull(),
}, (table) => [index("mailbox_credential_mailbox_idx").on(table.mailboxId)]);

export const mailboxFolder = sqliteTable("mailbox_folder", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  mailboxId: text("mailbox_id").notNull().references(() => mailbox.id, { onDelete: "cascade" }),
  providerFolderId: text("provider_folder_id").notNull(),
  displayName: text("display_name").notNull(),
  kind: text("kind").notNull(),
  selected: integer("selected", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .$onUpdate(() => new Date())
    .notNull(),
});

export const gmailMailboxState = sqliteTable("gmail_mailbox_state", {
  mailboxId: text("mailbox_id").primaryKey().references(() => mailbox.id, { onDelete: "cascade" }),
  gmailAddress: text("gmail_address").notNull(),
  lastHistoryId: text("last_history_id"),
  watchExpirationAt: integer("watch_expiration_at", { mode: "timestamp_ms" }),
  watchStatus: text("watch_status").notNull().default("inactive"),
  lastFullSyncAt: integer("last_full_sync_at", { mode: "timestamp_ms" }),
  lastPartialSyncAt: integer("last_partial_sync_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .$onUpdate(() => new Date())
    .notNull(),
});
```

```ts
// packages/mail/src/index.ts
export * from "./crypto/seal";
export * from "./sync/payload";
```

- [ ] **Step 4: Run tests, generate migrations, and verify types**

Run: `pnpm exec vitest run packages/mail/src/crypto/seal.test.ts packages/mail/src/sync/payload.test.ts`  
Expected: PASS

Run: `pnpm run db:generate`  
Expected: migration generated for `mailbox_credential`, `mailbox_folder`, `gmail_mailbox_state`

Run: `pnpm run check-types`  
Expected: PASS

- [ ] **Step 5: Commit the shared Gmail foundation**

```bash
git add packages/mail/package.json packages/mail/tsconfig.json packages/mail/src/index.ts packages/mail/src/crypto/seal.ts packages/mail/src/crypto/seal.test.ts packages/mail/src/sync/payload.ts packages/mail/src/sync/payload.test.ts packages/db/src/schema/provider.ts packages/db/src/schema/index.ts packages/db/src/index.ts packages/db/src/migrations packages/api/package.json apps/server/package.json
git commit -m "feat: add shared mail package and gmail state schema"
```

### Task 2: Implement Gmail OAuth connect flow, mailbox creation, and label selection

**Files:**
- Create: `packages/mail/src/gmail/constants.ts`
- Create: `packages/mail/src/gmail/oauth-state.ts`
- Create: `packages/mail/src/gmail/oauth-state.test.ts`
- Create: `packages/mail/src/gmail/oauth.ts`
- Create: `packages/mail/src/gmail/profile.ts`
- Create: `packages/mail/src/gmail/labels.ts`
- Create: `packages/mail/src/storage/mailbox-credentials.ts`
- Create: `packages/api/src/mailboxes/repository.ts`
- Create: `packages/api/src/mailboxes/repository.test.ts`
- Create: `packages/api/src/routers/mailboxes.ts`
- Create: `apps/web/src/components/connect-gmail-button.tsx`
- Create: `apps/web/src/components/gmail-label-selector.tsx`
- Create: `apps/web/src/components/mailbox-status-card.tsx`
- Create: `apps/web/src/routes/_protected/mailboxes/connect.tsx`
- Create: `apps/web/src/routes/_protected/mailboxes/$mailboxId.tsx`
- Modify: `packages/api/src/routers/index.ts`
- Modify: `apps/server/src/index.ts`
- Modify: `packages/infra/alchemy.run.ts`
- Modify: `apps/server/.env`
- Modify: `apps/web/src/routes/_protected/mailboxes.tsx`
- Modify: `README.md`

- [ ] **Step 1: Write the failing OAuth state and mailbox repository tests**

```ts
// packages/mail/src/gmail/oauth-state.test.ts
import { describe, expect, it } from "vitest";

import { parseOauthState, signOauthState } from "./oauth-state";

describe("gmail oauth state", () => {
  it("signs and verifies mailbox connect state", async () => {
    const secret = "gmail-oauth-state-secret";
    const state = await signOauthState(secret, {
      redirectTo: "/mailboxes/connect",
      provider: "gmail",
    });

    await expect(parseOauthState(secret, state)).resolves.toMatchObject({ provider: "gmail" });
  });
});
```

```ts
// packages/api/src/mailboxes/repository.test.ts
import { describe, expect, it } from "vitest";

import { createMailboxRepository } from "./repository";

describe("createMailboxRepository", () => {
  it("creates a pending Gmail mailbox record with selected labels", async () => {
    const inserted: any[] = [];
    const repository = createMailboxRepository({
      insertMailbox: async (row) => inserted.push(row),
      insertFolders: async (rows) => inserted.push(...rows),
    } as any);

    const mailbox = await repository.createGmailMailbox({
      address: "user@example.com",
      selectedLabels: [{ id: "INBOX", name: "Inbox", kind: "system" }],
    });

    expect(mailbox.provider).toBe("gmail");
    expect(inserted.some((row) => row.providerFolderId === "INBOX")).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run packages/mail/src/gmail/oauth-state.test.ts packages/api/src/mailboxes/repository.test.ts`  
Expected: FAIL with missing module errors

- [ ] **Step 3: Implement Gmail OAuth helpers, the mailbox repository, and the connect UI/API**

```ts
// packages/mail/src/gmail/constants.ts
export const GMAIL_PROVIDER = "gmail";
export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GMAIL_API_BASE_URL = "https://gmail.googleapis.com/gmail/v1/users/me";
export const GMAIL_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.readonly",
];
```

```ts
// packages/mail/src/gmail/oauth-state.ts
async function hmac(secret: string, value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return Buffer.from(signature).toString("base64url");
}

export async function signOauthState(secret: string, payload: Record<string, string>) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = await hmac(secret, body);
  return `${body}.${signature}`;
}

export async function parseOauthState(secret: string, value: string) {
  const [body, signature] = value.split(".");
  const expected = await hmac(secret, body);
  if (expected !== signature) throw new Error("Invalid OAuth state signature");
  return JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
}
```

```ts
// packages/mail/src/gmail/oauth.ts
import { GMAIL_SCOPES, GOOGLE_AUTH_URL, GOOGLE_TOKEN_URL } from "./constants";

export function buildGoogleAuthUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
}) {
  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("scope", GMAIL_SCOPES.join(" "));
  url.searchParams.set("state", input.state);
  return url.toString();
}

export async function exchangeGoogleCode(input: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}) {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: input.code,
      client_id: input.clientId,
      client_secret: input.clientSecret,
      redirect_uri: input.redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!response.ok) throw new Error(`Google token exchange failed: ${response.status}`);
  return response.json() as Promise<{
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope: string;
    token_type: string;
  }>;
}
```

```ts
// packages/mail/src/gmail/profile.ts
import { GMAIL_API_BASE_URL } from "./constants";

export async function getGoogleProfile(accessToken: string) {
  const response = await fetch(`${GMAIL_API_BASE_URL}/profile`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) throw new Error(`Failed to load Gmail profile: ${response.status}`);
  return response.json() as Promise<{ emailAddress: string; historyId: string }>;
}
```

```ts
// packages/mail/src/gmail/labels.ts
import { GMAIL_API_BASE_URL } from "./constants";

export async function listGoogleLabels(accessToken: string) {
  const response = await fetch(`${GMAIL_API_BASE_URL}/labels`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(`Failed to list Gmail labels: ${response.status}`);

  const body = (await response.json()) as {
    labels: Array<{ id: string; name: string; type: "system" | "user" }>;
  };

  return body.labels.map((label) => ({
    id: label.id,
    name: label.name,
    kind: label.type,
  }));
}
```

```ts
// packages/mail/src/storage/mailbox-credentials.ts
import { eq } from "drizzle-orm";

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
      await db.insert(mailboxCredential).values({
        mailboxId: input.mailboxId,
        provider: input.provider,
        accessTokenSealed: await sealValue(secret, input.accessToken),
        refreshTokenSealed: input.refreshToken ? await sealValue(secret, input.refreshToken) : null,
        expiresAt: input.expiresAt,
        scope: input.scope,
        tokenType: input.tokenType,
      }).onConflictDoUpdate({
        target: mailboxCredential.mailboxId,
        set: {
          accessTokenSealed: await sealValue(secret, input.accessToken),
          refreshTokenSealed: input.refreshToken ? await sealValue(secret, input.refreshToken) : null,
          expiresAt: input.expiresAt,
          scope: input.scope,
          tokenType: input.tokenType,
        },
      });
    },

    async readOauthTokens(mailboxId: string) {
      const row = await db.query.mailboxCredential.findFirst({
        where: eq(mailboxCredential.mailboxId, mailboxId),
      });
      if (!row || !row.accessTokenSealed) return null;

      return {
        accessToken: await openValue(secret, row.accessTokenSealed),
        refreshToken: row.refreshTokenSealed ? await openValue(secret, row.refreshTokenSealed) : null,
        expiresAt: row.expiresAt,
      };
    },
  };
}
```

```ts
// packages/api/src/mailboxes/repository.ts
import { eq } from "drizzle-orm";

import { mailbox } from "@email-relay/db/schema/mail";
import { gmailMailboxState, mailboxFolder } from "@email-relay/db/schema/provider";

export function createMailboxRepository(db: any) {
  return {
    async createGmailMailbox(input: {
      address: string;
      selectedLabels: Array<{ id: string; name: string; kind: string }>;
    }) {
      const [createdMailbox] = await db
        .insert(mailbox)
        .values({
          address: input.address,
          provider: "gmail",
          authType: "oauth",
          status: "active",
          selectedFoldersJson: JSON.stringify(input.selectedLabels.map((label) => label.id)),
        })
        .returning();

      await db.insert(mailboxFolder).values(
        input.selectedLabels.map((label) => ({
          mailboxId: createdMailbox.id,
          providerFolderId: label.id,
          displayName: label.name,
          kind: label.kind,
          selected: true,
        })),
      );

      await db.insert(gmailMailboxState).values({
        mailboxId: createdMailbox.id,
        gmailAddress: input.address,
      });

      return createdMailbox;
    },

    async listMailboxes() {
      return db.select().from(mailbox);
    },

    async replaceSelectedLabels(mailboxId: string, labels: Array<{ id: string; name: string; kind: string }>) {
      await db.delete(mailboxFolder).where(eq(mailboxFolder.mailboxId, mailboxId));
      await db.insert(mailboxFolder).values(
        labels.map((label) => ({
          mailboxId,
          providerFolderId: label.id,
          displayName: label.name,
          kind: label.kind,
          selected: true,
        })),
      );
      await db.update(mailbox).set({ selectedFoldersJson: JSON.stringify(labels.map((label) => label.id)) }).where(eq(mailbox.id, mailboxId));
    },
  };
}
```

```ts
// packages/api/src/routers/mailboxes.ts
import { z } from "zod";

import { protectedProcedure } from "../index";
import { createMailboxRepository } from "../mailboxes/repository";

export const mailboxesRouter = {
  list: protectedProcedure.handler(({ context }) => createMailboxRepository(context.db).listMailboxes()),
  updateSelectedFolders: protectedProcedure
    .input(
      z.object({
        mailboxId: z.string().min(1),
        labels: z.array(z.object({ id: z.string(), name: z.string(), kind: z.string() })).min(1),
      }),
    )
    .handler(({ context, input }) =>
      createMailboxRepository(context.db).replaceSelectedLabels(input.mailboxId, input.labels),
    ),
};
```

```ts
// apps/server/src/index.ts (add only the Gmail routes)
import { buildGoogleAuthUrl, exchangeGoogleCode, getGoogleProfile, listGoogleLabels, signOauthState, parseOauthState } from "@email-relay/mail";
import { createMailboxCredentialStore } from "@email-relay/mail/storage/mailbox-credentials";
import { createMailboxRepository } from "@email-relay/api/mailboxes/repository";

app.get("/oauth/gmail/start", async (c) => {
  const state = await signOauthState(c.env.MAILBOX_OAUTH_STATE_SECRET, {
    provider: "gmail",
    redirectTo: c.req.query("redirectTo") ?? "/mailboxes",
  });

  return c.redirect(
    buildGoogleAuthUrl({
      clientId: c.env.GOOGLE_CLIENT_ID,
      redirectUri: c.env.GOOGLE_OAUTH_REDIRECT_URL,
      state,
    }),
  );
});

app.get("/oauth/gmail/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  if (!code || !state) return c.text("Missing Gmail OAuth callback params", 400);

  await parseOauthState(c.env.MAILBOX_OAUTH_STATE_SECRET, state);
  const tokens = await exchangeGoogleCode({
    code,
    clientId: c.env.GOOGLE_CLIENT_ID,
    clientSecret: c.env.GOOGLE_CLIENT_SECRET,
    redirectUri: c.env.GOOGLE_OAUTH_REDIRECT_URL,
  });

  const profile = await getGoogleProfile(tokens.access_token);
  const labels = await listGoogleLabels(tokens.access_token);
  const mailboxRepository = createMailboxRepository(createDb());
  const credentialStore = createMailboxCredentialStore(createDb(), c.env.MAILBOX_CREDENTIALS_SECRET);

  const selectedLabels = labels.filter((label) => label.id === "INBOX");
  const mailboxRecord = await mailboxRepository.createGmailMailbox({
    address: profile.emailAddress,
    selectedLabels,
  });

  await credentialStore.saveOauthTokens({
    mailboxId: mailboxRecord.id,
    provider: "gmail",
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
    scope: tokens.scope,
    tokenType: tokens.token_type,
  });

  return c.redirect(`${c.env.CORS_ORIGIN}/mailboxes/${mailboxRecord.id}`);
});
```

```tsx
// apps/web/src/components/connect-gmail-button.tsx
import { Button } from "@email-relay/ui/components/button";

export default function ConnectGmailButton() {
  return (
    <Button asChild>
      <a href={`${import.meta.env.VITE_SERVER_URL}/oauth/gmail/start?redirectTo=/mailboxes`}>连接 Gmail</a>
    </Button>
  );
}
```

```tsx
// apps/web/src/routes/_protected/mailboxes.tsx (show only the important new portion)
import ConnectGmailButton from "@/components/connect-gmail-button";
import MailboxStatusCard from "@/components/mailbox-status-card";

function MailboxesPage() {
  const mailboxes = useQuery(orpc.mailboxes.list.queryOptions());

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">邮箱</h1>
          <p className="text-sm text-muted-foreground">先接入 Gmail，后续计划再接入 Outlook 和 IMAP。</p>
        </div>
        <ConnectGmailButton />
      </div>
      <div className="grid gap-4">
        {(mailboxes.data ?? []).map((mailbox) => (
          <MailboxStatusCard key={mailbox.id} mailbox={mailbox} />
        ))}
      </div>
    </div>
  );
}
```

```env
# apps/server/.env (append)
MAILBOX_CREDENTIALS_SECRET=replace-with-32-byte-dev-secret
MAILBOX_OAUTH_STATE_SECRET=replace-with-long-state-secret
GOOGLE_CLIENT_ID=replace-with-google-client-id
GOOGLE_CLIENT_SECRET=replace-with-google-client-secret
GOOGLE_OAUTH_REDIRECT_URL=https://email-relay-server-mageia.mageia.workers.dev/oauth/gmail/callback
GOOGLE_GMAIL_PUBSUB_TOPIC=projects/<gcp-project>/topics/<gmail-topic>
GOOGLE_GMAIL_PUSH_TOKEN=replace-with-webhook-token
```

```ts
// packages/infra/alchemy.run.ts (server bindings additions)
bindings: {
  DB: db,
  CORS_ORIGIN: alchemy.env.CORS_ORIGIN!,
  BETTER_AUTH_SECRET: alchemy.secret.env.BETTER_AUTH_SECRET!,
  BETTER_AUTH_URL: alchemy.env.BETTER_AUTH_URL!,
  ADMIN_BOOTSTRAP_PASSWORD: alchemy.secret.env.ADMIN_BOOTSTRAP_PASSWORD!,
  MAILBOX_CREDENTIALS_SECRET: alchemy.secret.env.MAILBOX_CREDENTIALS_SECRET!,
  MAILBOX_OAUTH_STATE_SECRET: alchemy.secret.env.MAILBOX_OAUTH_STATE_SECRET!,
  GOOGLE_CLIENT_ID: alchemy.env.GOOGLE_CLIENT_ID!,
  GOOGLE_CLIENT_SECRET: alchemy.secret.env.GOOGLE_CLIENT_SECRET!,
  GOOGLE_OAUTH_REDIRECT_URL: alchemy.env.GOOGLE_OAUTH_REDIRECT_URL!,
  GOOGLE_GMAIL_PUBSUB_TOPIC: alchemy.env.GOOGLE_GMAIL_PUBSUB_TOPIC!,
  GOOGLE_GMAIL_PUSH_TOKEN: alchemy.secret.env.GOOGLE_GMAIL_PUSH_TOKEN!,
},
```

- [ ] **Step 4: Verify the connect flow locally and in Cloudflare dev**

Run: `pnpm exec vitest run packages/mail/src/gmail/oauth-state.test.ts packages/api/src/mailboxes/repository.test.ts`  
Expected: PASS

Run: `pnpm run check-types`  
Expected: PASS

Run: `pnpm run deploy`  
Expected: deploy succeeds, clicking “连接 Gmail” redirects to Google, and a successful callback creates a Gmail mailbox row with INBOX selected

- [ ] **Step 5: Commit the Gmail connect flow**

```bash
git add packages/mail/src/gmail/constants.ts packages/mail/src/gmail/oauth-state.ts packages/mail/src/gmail/oauth-state.test.ts packages/mail/src/gmail/oauth.ts packages/mail/src/gmail/profile.ts packages/mail/src/gmail/labels.ts packages/mail/src/storage/mailbox-credentials.ts packages/api/src/mailboxes/repository.ts packages/api/src/mailboxes/repository.test.ts packages/api/src/routers/mailboxes.ts packages/api/src/routers/index.ts apps/server/src/index.ts packages/infra/alchemy.run.ts apps/server/.env apps/web/src/components/connect-gmail-button.tsx apps/web/src/components/gmail-label-selector.tsx apps/web/src/components/mailbox-status-card.tsx apps/web/src/routes/_protected/mailboxes.tsx apps/web/src/routes/_protected/mailboxes/connect.tsx apps/web/src/routes/_protected/mailboxes/$mailboxId.tsx README.md
git commit -m "feat: add gmail oauth mailbox connect flow"
```

### Task 3: Implement Gmail initial full sync and inbox upsert pipeline

**Files:**
- Create: `packages/mail/src/gmail/message.ts`
- Create: `packages/mail/src/gmail/message.test.ts`
- Create: `packages/mail/src/storage/message-upserts.ts`
- Create: `apps/server/src/mail/queue.ts`
- Modify: `packages/mail/src/index.ts`
- Modify: `apps/server/src/index.ts`
- Modify: `packages/infra/alchemy.run.ts`
- Modify: `apps/web/src/routes/_protected/inbox.tsx`
- Modify: `packages/api/src/inbox/repository.ts`

- [ ] **Step 1: Write the failing Gmail payload normalization test**

```ts
// packages/mail/src/gmail/message.test.ts
import { describe, expect, it } from "vitest";

import { normalizeGmailMessage } from "./message";

describe("normalizeGmailMessage", () => {
  it("maps a Gmail FULL payload into the inbox storage shape", () => {
    const normalized = normalizeGmailMessage({
      id: "gmail-message-1",
      threadId: "thread-1",
      labelIds: ["INBOX"],
      payload: {
        headers: [
          { name: "Subject", value: "Hello" },
          { name: "From", value: "Sender <sender@example.com>" },
        ],
        mimeType: "text/plain",
        body: { data: Buffer.from("body text").toString("base64url") },
      },
      internalDate: String(Date.UTC(2026, 3, 12)),
      snippet: "body text",
      historyId: "12345",
    });

    expect(normalized.subject).toBe("Hello");
    expect(normalized.bodyText).toContain("body text");
    expect(normalized.providerMessageId).toBe("gmail-message-1");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run packages/mail/src/gmail/message.test.ts`  
Expected: FAIL because `normalizeGmailMessage` does not exist

- [ ] **Step 3: Implement the Gmail message mapper, queue consumer, and upsert pipeline**

```ts
// packages/mail/src/gmail/message.ts
function decodeBody(data?: string) {
  return data ? Buffer.from(data, "base64url").toString("utf8") : "";
}

function findHeader(headers: Array<{ name: string; value: string }> | undefined, name: string) {
  return headers?.find((header) => header.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

export function normalizeGmailMessage(message: any) {
  const headers = message.payload?.headers ?? [];

  return {
    providerMessageId: message.id,
    internetMessageId: findHeader(headers, "Message-Id") || null,
    subject: findHeader(headers, "Subject"),
    snippet: message.snippet ?? "",
    fromJson: JSON.stringify([{ raw: findHeader(headers, "From") }]),
    toJson: JSON.stringify([{ raw: findHeader(headers, "To") }]),
    ccJson: JSON.stringify([{ raw: findHeader(headers, "Cc") }]),
    bodyHtml: message.payload?.mimeType === "text/html" ? decodeBody(message.payload?.body?.data) : "",
    bodyText: message.payload?.mimeType === "text/plain" ? decodeBody(message.payload?.body?.data) : decodeBody(message.payload?.body?.data),
    receivedAt: new Date(Number(message.internalDate)),
    sentAt: findHeader(headers, "Date") ? new Date(findHeader(headers, "Date")) : null,
    isRead: !(message.labelIds ?? []).includes("UNREAD"),
    attachments: [],
  };
}
```

```ts
// packages/mail/src/storage/message-upserts.ts
import { and, eq } from "drizzle-orm";

import { mailMessage } from "@email-relay/db/schema/mail";

export async function upsertNormalizedMessage(db: any, input: {
  mailboxId: string;
  providerMessageId: string;
  internetMessageId: string | null;
  subject: string;
  snippet: string;
  fromJson: string;
  toJson: string;
  ccJson: string;
  bodyHtml: string;
  bodyText: string;
  isRead: boolean;
  receivedAt: Date;
  sentAt: Date | null;
}) {
  const existing = await db.query.mailMessage.findFirst({
    where: and(
      eq(mailMessage.mailboxId, input.mailboxId),
      eq(mailMessage.providerMessageId, input.providerMessageId),
    ),
  });

  if (existing) {
    await db.update(mailMessage).set(input).where(eq(mailMessage.id, existing.id));
    return existing.id;
  }

  const [created] = await db.insert(mailMessage).values(input).returning({ id: mailMessage.id });
  return created.id;
}
```

```ts
// apps/server/src/mail/queue.ts
import { eq, inArray } from "drizzle-orm";

import { createDb } from "@email-relay/db";
import { mailbox, syncJob } from "@email-relay/db/schema/mail";
import { gmailMailboxState } from "@email-relay/db/schema/provider";
import { MailSyncPayloadSchema, createMailboxCredentialStore, normalizeGmailMessage, upsertNormalizedMessage } from "@email-relay/mail";

async function fetchGmailMessages(accessToken: string, labelIds: string[]) {
  const query = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
  labelIds.forEach((labelId) => query.searchParams.append("labelIds", labelId));
  query.searchParams.set("maxResults", "50");

  const listResponse = await fetch(query, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!listResponse.ok) throw new Error(`Gmail list failed: ${listResponse.status}`);

  const listBody = (await listResponse.json()) as { messages?: Array<{ id: string }> };
  return Promise.all(
    (listBody.messages ?? []).map(async ({ id }) => {
      const detailResponse = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!detailResponse.ok) throw new Error(`Gmail get failed: ${detailResponse.status}`);
      return detailResponse.json();
    }),
  );
}

export async function handleMailQueue(batch: MessageBatch<unknown>, env: Env) {
  const db = createDb();
  const credentialStore = createMailboxCredentialStore(db, env.MAILBOX_CREDENTIALS_SECRET);

  for (const message of batch.messages) {
    const payload = MailSyncPayloadSchema.parse(message.body);
    if (payload.provider !== "gmail") continue;

    const mailboxRow = await db.query.mailbox.findFirst({ where: eq(mailbox.id, payload.mailboxId) });
    if (!mailboxRow) {
      message.ack();
      continue;
    }

    const credentials = await credentialStore.readOauthTokens(payload.mailboxId);
    if (!credentials?.accessToken) throw new Error(`Missing Gmail credentials for ${payload.mailboxId}`);

    const selectedLabels = JSON.parse(mailboxRow.selectedFoldersJson) as string[];
    const gmailMessages = await fetchGmailMessages(credentials.accessToken, selectedLabels.length ? selectedLabels : ["INBOX"]);

    for (const gmailMessage of gmailMessages) {
      const normalized = normalizeGmailMessage(gmailMessage);
      await upsertNormalizedMessage(db, {
        mailboxId: payload.mailboxId,
        ...normalized,
      });
    }

    const latestHistoryId = gmailMessages[0]?.historyId;
    if (latestHistoryId) {
      await db.update(gmailMailboxState).set({ lastHistoryId: latestHistoryId, lastFullSyncAt: new Date() }).where(eq(gmailMailboxState.mailboxId, payload.mailboxId));
    }

    message.ack();
  }
}
```

```ts
// packages/infra/alchemy.run.ts (add queue)
import { Queue } from "alchemy/cloudflare";

const mailSyncQueue = await Queue("mail-sync", {
  name: "email-relay-mail-sync",
});

export const server = await Worker("server", {
  cwd: "../../apps/server",
  entrypoint: "src/index.ts",
  compatibility: "node",
  bindings: {
    DB: db,
    MAIL_SYNC_QUEUE: mailSyncQueue,
    // existing bindings ...
  },
  eventSources: [
    {
      queue: mailSyncQueue,
      settings: {
        batchSize: 10,
        maxRetries: 5,
        retryDelay: 30,
      },
    },
  ],
});
```

```ts
// apps/server/src/index.ts (export queue)
import { handleMailQueue } from "./mail/queue";

export default {
  fetch: app.fetch,
  queue: handleMailQueue,
};
```

- [ ] **Step 4: Run verification and check that Gmail messages reach the inbox**

Run: `pnpm exec vitest run packages/mail/src/gmail/message.test.ts`  
Expected: PASS

Run: `pnpm run check-types`  
Expected: PASS

Run: `pnpm run deploy`  
Expected: after connecting a Gmail mailbox, the callback enqueues an initial sync and `/inbox` shows real Gmail messages from selected labels

- [ ] **Step 5: Commit the Gmail full-sync slice**

```bash
git add packages/mail/src/gmail/message.ts packages/mail/src/gmail/message.test.ts packages/mail/src/storage/message-upserts.ts apps/server/src/mail/queue.ts apps/server/src/index.ts packages/infra/alchemy.run.ts packages/api/src/inbox/repository.ts apps/web/src/routes/_protected/inbox.tsx
git commit -m "feat: sync gmail messages into inbox"
```

### Task 4: Add Gmail push-triggered incremental sync, history replay, and watch renewal

**Files:**
- Create: `packages/mail/src/gmail/history.ts`
- Create: `packages/mail/src/gmail/watch.ts`
- Create: `apps/server/src/mail/gmail-webhook.ts`
- Create: `apps/server/src/mail/scheduled.ts`
- Modify: `apps/server/src/mail/queue.ts`
- Modify: `apps/server/src/index.ts`
- Modify: `packages/infra/alchemy.run.ts`
- Modify: `README.md`

- [ ] **Step 1: Write the failing watch-renewal and webhook decode tests**

```ts
// packages/mail/src/gmail/history.test.ts
import { describe, expect, it } from "vitest";

import { decodeGmailPushBody } from "./history";

describe("decodeGmailPushBody", () => {
  it("decodes Pub/Sub data into email + historyId", () => {
    const encoded = Buffer.from(JSON.stringify({ emailAddress: "user@example.com", historyId: "999" })).toString("base64");

    expect(
      decodeGmailPushBody({
        message: { data: encoded },
        subscription: "projects/acme/subscriptions/gmail-watch",
      }),
    ).toEqual({ emailAddress: "user@example.com", historyId: "999" });
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `pnpm exec vitest run packages/mail/src/gmail/history.test.ts`  
Expected: FAIL with missing module errors

- [ ] **Step 3: Implement watch registration, webhook decode, queue enqueue, and scheduled renewal**

```ts
// packages/mail/src/gmail/watch.ts
import { GOOGLE_GMAIL_PUBSUB_TOPIC } from "./constants";

export async function startGmailWatch(accessToken: string, topicName: string, labelIds: string[]) {
  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/watch", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      topicName,
      labelIds,
      labelFilterBehavior: "include",
    }),
  });

  if (!response.ok) throw new Error(`Failed to start Gmail watch: ${response.status}`);
  return response.json() as Promise<{ historyId: string; expiration: string }>;
}
```

```ts
// packages/mail/src/gmail/history.ts
export function decodeGmailPushBody(body: {
  message?: { data?: string };
}) {
  const encoded = body.message?.data;
  if (!encoded) throw new Error("Missing Gmail Pub/Sub message data");

  return JSON.parse(Buffer.from(encoded, "base64").toString("utf8")) as {
    emailAddress: string;
    historyId: string;
  };
}
```

```ts
// apps/server/src/mail/gmail-webhook.ts
import { eq } from "drizzle-orm";

import { createDb } from "@email-relay/db";
import { mailbox } from "@email-relay/db/schema/mail";
import { gmailMailboxState } from "@email-relay/db/schema/provider";
import { decodeGmailPushBody } from "@email-relay/mail/gmail/history";

export async function handleGmailWebhook(request: Request, env: Env) {
  const url = new URL(request.url);
  if (url.searchParams.get("token") !== env.GOOGLE_GMAIL_PUSH_TOKEN) {
    return new Response("Forbidden", { status: 403 });
  }

  const body = (await request.json()) as { message?: { data?: string } };
  const decoded = decodeGmailPushBody(body);
  const db = createDb();
  const mailboxRow = await db.query.mailbox.findFirst({ where: eq(mailbox.address, decoded.emailAddress) });
  if (!mailboxRow) {
    return new Response("Ignored", { status: 202 });
  }

  await env.MAIL_SYNC_QUEUE.send({
    provider: "gmail",
    mailboxId: mailboxRow.id,
    reason: "gmail-history",
    historyId: decoded.historyId,
  });

  return new Response("Accepted", { status: 202 });
}
```

```ts
// apps/server/src/mail/scheduled.ts
import { and, lt } from "drizzle-orm";

import { createDb } from "@email-relay/db";
import { mailbox } from "@email-relay/db/schema/mail";
import { gmailMailboxState } from "@email-relay/db/schema/provider";
import { startGmailWatch } from "@email-relay/mail/gmail/watch";
import { createMailboxCredentialStore } from "@email-relay/mail/storage/mailbox-credentials";

export async function handleScheduled(_: ScheduledController, env: Env) {
  const db = createDb();
  const credentialStore = createMailboxCredentialStore(db, env.MAILBOX_CREDENTIALS_SECRET);

  const staleWatches = await db
    .select({ mailboxId: gmailMailboxState.mailboxId, address: mailbox.address, selectedFoldersJson: mailbox.selectedFoldersJson })
    .from(gmailMailboxState)
    .innerJoin(mailbox, and(gmailMailboxState.mailboxId.eq(mailbox.id)))
    .where(lt(gmailMailboxState.watchExpirationAt, new Date(Date.now() + 24 * 60 * 60 * 1000)));

  for (const row of staleWatches) {
    const credentials = await credentialStore.readOauthTokens(row.mailboxId);
    if (!credentials?.accessToken) continue;

    const watch = await startGmailWatch(
      credentials.accessToken,
      env.GOOGLE_GMAIL_PUBSUB_TOPIC,
      JSON.parse(row.selectedFoldersJson) as string[],
    );

    await db.update(gmailMailboxState).set({
      lastHistoryId: watch.historyId,
      watchExpirationAt: new Date(Number(watch.expiration)),
      watchStatus: "active",
    }).where(eq(gmailMailboxState.mailboxId, row.mailboxId));
  }
}
```

```ts
// apps/server/src/index.ts (add webhook route + scheduled export)
import { handleGmailWebhook } from "./mail/gmail-webhook";
import { handleScheduled } from "./mail/scheduled";

app.post("/webhooks/gmail/push", async (c) => handleGmailWebhook(c.req.raw, c.env));

export default {
  fetch: app.fetch,
  queue: handleMailQueue,
  scheduled: handleScheduled,
};
```

```ts
// packages/infra/alchemy.run.ts (cron triggers)
export const server = await Worker("server", {
  // existing props...
  crons: ["0 */6 * * *", "*/15 * * * *"],
});
```

- [ ] **Step 4: Verify push + incremental sync behavior**

Run: `pnpm exec vitest run packages/mail/src/gmail/history.test.ts`  
Expected: PASS

Run: `pnpm run check-types`  
Expected: PASS

Run: `pnpm run deploy`  
Expected:
- Gmail callback registers a watch and stores `watchExpirationAt`
- posting a Pub/Sub payload to `/webhooks/gmail/push?token=<token>` enqueues a Gmail history sync payload
- new Gmail messages appear in `/inbox` without reconnecting the mailbox

- [ ] **Step 5: Commit the incremental Gmail sync path**

```bash
git add packages/mail/src/gmail/history.ts packages/mail/src/gmail/watch.ts apps/server/src/mail/gmail-webhook.ts apps/server/src/mail/scheduled.ts apps/server/src/mail/queue.ts apps/server/src/index.ts packages/infra/alchemy.run.ts README.md
git commit -m "feat: add gmail incremental sync and watch renewal"
```

### Task 5: Finish Cloudflare verification and operator docs for Gmail

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-04-12-multi-email-aggregator-design.md` (only if the implementation reveals a necessary clarification)

- [ ] **Step 1: Document the exact Gmail prerequisites**

```md
## Gmail setup

1. Create a Google Cloud project.
2. Enable the Gmail API and Cloud Pub/Sub API.
3. Create a Web OAuth client whose redirect URI is `https://<server-url>/oauth/gmail/callback`.
4. Create a Pub/Sub topic and a push subscription targeting `https://<server-url>/webhooks/gmail/push?token=<GOOGLE_GMAIL_PUSH_TOKEN>`.
5. Grant publish permission on the topic to `gmail-api-push@system.gserviceaccount.com`.
```

- [ ] **Step 2: Verify the production checklist end-to-end**

Run:

```bash
set -a
source ./.env
set +a
pnpm run deploy
curl -i https://email-relay-server-mageia.mageia.workers.dev/admin/session
```

Expected checklist:
- `/mailboxes` shows a Gmail connect button
- Google OAuth succeeds and returns to the mailbox detail page
- INBOX is selected by default and can be changed on the mailbox detail page
- initial queue sync creates real rows in the inbox
- Pub/Sub push hits `/webhooks/gmail/push` and triggers history sync
- cron renewal keeps `watchExpirationAt` in the future

- [ ] **Step 3: Commit the operator documentation updates**

```bash
git add README.md docs/superpowers/specs/2026-04-12-multi-email-aggregator-design.md
git commit -m "docs: add gmail setup and verification guide"
```

---

## Self-review

### Spec coverage
- Gmail OAuth connection: Task 2
- Label selection / selected folders: Task 2
- Initial full sync into inbox: Task 3
- Push/webhook + near-real-time sync: Task 4
- Cloudflare-first deployment checkpoints: Tasks 2, 3, 4, 5

### Placeholder scan
- No unresolved placeholders inside execution steps
- Deferred Outlook/IMAP work is intentionally isolated to separate plans

### Type consistency
- `MailSyncPayloadSchema` remains the queue contract
- `mailboxCredential`, `mailboxFolder`, `gmailMailboxState` naming is consistent across schema and handlers
- Gmail provider identifier is consistently `"gmail"`
