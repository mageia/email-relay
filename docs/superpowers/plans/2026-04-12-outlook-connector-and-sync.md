# Outlook Connector & Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Microsoft Outlook / Microsoft 365 mailbox connection, folder selection, initial delta sync, change-notification-driven incremental sync, and Cloudflare deployment verification so Outlook messages appear in the unified inbox.

**Architecture:** Extend the shared `packages/mail` connector package with Outlook-specific OAuth, Microsoft Graph API helpers, folder discovery, delta-token state, and subscription renewal logic. Reuse the generic credential store and queue contract introduced by the Gmail plan so Outlook can flow through the same inbox storage pipeline without special-casing the UI.

**Tech Stack:** Hono, oRPC, Drizzle ORM, Cloudflare Workers, Cloudflare Queues, Cloudflare Cron Triggers, Microsoft Graph, Microsoft Entra OAuth 2.0 Authorization Code Flow, Vitest

---

## Scope split

This plan assumes the following are already complete:
- `2026-04-12-control-plane-and-unified-inbox-foundation.md`
- `2026-04-12-gmail-connector-and-sync.md` up through the shared `packages/mail` package and generic queue pipeline

It only adds **Outlook**.

## File structure map

### Create
- `packages/mail/src/outlook/constants.ts` — Microsoft Graph endpoints, scopes, provider identifiers
- `packages/mail/src/outlook/oauth.ts` — Outlook auth URL and token exchange helpers
- `packages/mail/src/outlook/oauth-state.ts` — Outlook-specific signed OAuth state helper wrapper
- `packages/mail/src/outlook/oauth-state.test.ts` — Outlook state tests
- `packages/mail/src/outlook/profile.ts` — profile and mailbox address lookup via Graph `/me`
- `packages/mail/src/outlook/folders.ts` — folder discovery + folder selection mapper
- `packages/mail/src/outlook/message.ts` — Graph message normalization into inbox storage shape
- `packages/mail/src/outlook/message.test.ts` — Graph normalization tests
- `packages/mail/src/outlook/delta.ts` — delta query helpers and pagination
- `packages/mail/src/outlook/subscription.ts` — change notification create/renew/delete helpers
- `packages/db/src/schema/outlook.ts` — Outlook mailbox state (delta links, subscription ids, expiry)
- `packages/api/src/routers/outlook-mailboxes.ts` — optional route split if mailbox router becomes too large
- `apps/server/src/mail/outlook-webhook.ts` — Graph change notification validation + enqueue logic

### Modify
- `packages/mail/src/index.ts` — export Outlook helpers
- `packages/mail/src/sync/payload.ts` — extend payload union with Outlook reasons
- `packages/db/src/schema/index.ts` — export `outlook.ts`
- `packages/db/src/index.ts` — include Outlook schema module
- `packages/api/src/mailboxes/repository.ts` — add Outlook mailbox creation and folder replacement
- `packages/api/src/routers/mailboxes.ts` — add Outlook connect/list-detail procedures
- `packages/api/src/routers/index.ts` — register any split Outlook router exports
- `apps/server/src/index.ts` — add Outlook OAuth start/callback and webhook routes
- `apps/server/src/mail/queue.ts` — dispatch Outlook payloads through the generic queue worker
- `apps/server/src/mail/scheduled.ts` — renew Graph subscriptions and fall back to periodic delta polling
- `packages/infra/alchemy.run.ts` — add Outlook env/secrets, cron coverage, and any route bindings
- `apps/server/.env` — add local Microsoft env vars
- `apps/web/src/components/mailbox-status-card.tsx` — show Outlook metadata
- `apps/web/src/routes/_protected/mailboxes.tsx` — add Outlook connect CTA
- `apps/web/src/routes/_protected/mailboxes/$mailboxId.tsx` — support Outlook folder selection details
- `README.md` — document Outlook / Entra setup

---

### Task 1: Add Outlook state schema, auth helpers, and payload coverage

**Files:**
- Create: `packages/mail/src/outlook/constants.ts`
- Create: `packages/mail/src/outlook/oauth.ts`
- Create: `packages/mail/src/outlook/oauth-state.ts`
- Create: `packages/mail/src/outlook/oauth-state.test.ts`
- Create: `packages/db/src/schema/outlook.ts`
- Modify: `packages/mail/src/index.ts`
- Modify: `packages/mail/src/sync/payload.ts`
- Modify: `packages/db/src/schema/index.ts`
- Modify: `packages/db/src/index.ts`

- [ ] **Step 1: Write the failing Outlook state and payload tests**

```ts
// packages/mail/src/outlook/oauth-state.test.ts
import { describe, expect, it } from "vitest";

import { parseOutlookOauthState, signOutlookOauthState } from "./oauth-state";

describe("outlook oauth state", () => {
  it("round-trips the state payload", async () => {
    const secret = "outlook-oauth-state-secret";
    const state = await signOutlookOauthState(secret, {
      provider: "outlook",
      redirectTo: "/mailboxes",
    });

    await expect(parseOutlookOauthState(secret, state)).resolves.toMatchObject({
      provider: "outlook",
    });
  });
});
```

```ts
// packages/mail/src/sync/payload.test.ts (append this test)
it("accepts an Outlook delta payload", () => {
  expect(
    MailSyncPayloadSchema.parse({
      provider: "outlook",
      mailboxId: "mailbox-2",
      reason: "outlook-delta",
      deltaLink: "https://graph.microsoft.com/v1.0/me/messages/delta?...",
    }),
  ).toMatchObject({ provider: "outlook", mailboxId: "mailbox-2" });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `pnpm exec vitest run packages/mail/src/outlook/oauth-state.test.ts packages/mail/src/sync/payload.test.ts`  
Expected: FAIL because Outlook helpers and payload branch do not exist

- [x] **Step 3: Implement Outlook constants, auth helpers, payload branch, and schema**

```ts
// packages/mail/src/outlook/constants.ts
export const OUTLOOK_PROVIDER = "outlook";
export const MICROSOFT_AUTH_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
export const MICROSOFT_TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
export const MICROSOFT_GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0";
export const OUTLOOK_SCOPES = [
  "openid",
  "profile",
  "offline_access",
  "email",
  "Mail.Read",
  "MailboxSettings.Read",
];
```

```ts
// packages/mail/src/outlook/oauth.ts
import { MICROSOFT_AUTH_URL, MICROSOFT_TOKEN_URL, OUTLOOK_SCOPES } from "./constants";

export function buildOutlookAuthUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
}) {
  const url = new URL(MICROSOFT_AUTH_URL);
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_mode", "query");
  url.searchParams.set("scope", OUTLOOK_SCOPES.join(" "));
  url.searchParams.set("state", input.state);
  return url.toString();
}

export async function exchangeOutlookCode(input: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}) {
  const response = await fetch(MICROSOFT_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: input.clientId,
      client_secret: input.clientSecret,
      redirect_uri: input.redirectUri,
      grant_type: "authorization_code",
      code: input.code,
      scope: OUTLOOK_SCOPES.join(" "),
    }),
  });

  if (!response.ok) throw new Error(`Outlook token exchange failed: ${response.status}`);
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
// packages/mail/src/outlook/oauth-state.ts
import { parseOauthState, signOauthState } from "../gmail/oauth-state";

export function signOutlookOauthState(secret: string, payload: Record<string, string>) {
  return signOauthState(secret, payload);
}

export function parseOutlookOauthState(secret: string, state: string) {
  return parseOauthState(secret, state);
}
```

```ts
// packages/db/src/schema/outlook.ts
import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { mailbox } from "./mail";

export const outlookMailboxState = sqliteTable("outlook_mailbox_state", {
  mailboxId: text("mailbox_id").primaryKey().references(() => mailbox.id, { onDelete: "cascade" }),
  outlookAddress: text("outlook_address").notNull(),
  deltaLink: text("delta_link"),
  subscriptionId: text("subscription_id"),
  subscriptionResource: text("subscription_resource"),
  subscriptionExpiresAt: integer("subscription_expires_at", { mode: "timestamp_ms" }),
  lastDeltaSyncAt: integer("last_delta_sync_at", { mode: "timestamp_ms" }),
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
// packages/mail/src/sync/payload.ts (add this branch)
z.object({
  provider: z.literal("outlook"),
  mailboxId: z.string().min(1),
  reason: z.enum(["outlook-initial", "outlook-delta", "outlook-renew-subscription", "outlook-backfill"]),
  deltaLink: z.string().optional(),
  folderIds: z.array(z.string()).optional(),
}),
```

- [x] **Step 4: Run tests, generate migration, and verify types**

Run: `pnpm exec vitest run packages/mail/src/outlook/oauth-state.test.ts packages/mail/src/sync/payload.test.ts`  
Expected: PASS

Run: `pnpm run db:generate`  
Expected: migration generated for `outlook_mailbox_state`

Run: `pnpm run check-types`  
Expected: PASS

- [ ] **Step 5: Commit the Outlook auth/state foundation**

```bash
git add packages/mail/src/outlook/constants.ts packages/mail/src/outlook/oauth.ts packages/mail/src/outlook/oauth-state.ts packages/mail/src/outlook/oauth-state.test.ts packages/mail/src/sync/payload.ts packages/db/src/schema/outlook.ts packages/db/src/schema/index.ts packages/db/src/index.ts packages/db/src/migrations
git commit -m "feat: add outlook oauth and state foundation"
```

### Task 2: Implement Outlook OAuth connect flow and folder selection UI

**Files:**
- Create: `packages/mail/src/outlook/profile.ts`
- Create: `packages/mail/src/outlook/folders.ts`
- Modify: `packages/api/src/mailboxes/repository.ts`
- Modify: `packages/api/src/routers/mailboxes.ts`
- Modify: `apps/server/src/index.ts`
- Modify: `packages/infra/alchemy.run.ts`
- Modify: `apps/server/.env`
- Modify: `apps/web/src/routes/_protected/mailboxes.tsx`
- Modify: `apps/web/src/routes/_protected/mailboxes/$mailboxId.tsx`

- [ ] **Step 1: Write the failing folder-mapping test**

```ts
// packages/mail/src/outlook/folders.test.ts
import { describe, expect, it } from "vitest";

import { mapOutlookFolders } from "./folders";

describe("mapOutlookFolders", () => {
  it("normalizes Graph mailFolders into the mailbox_folder shape", () => {
    expect(
      mapOutlookFolders([
        { id: "inbox-id", displayName: "Inbox", wellKnownName: "inbox" },
        { id: "archive-id", displayName: "Archive", wellKnownName: undefined },
      ]),
    ).toEqual([
      { id: "inbox-id", name: "Inbox", kind: "system", selected: true },
      { id: "archive-id", name: "Archive", kind: "custom", selected: false },
    ]);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `pnpm exec vitest run packages/mail/src/outlook/folders.test.ts`  
Expected: FAIL with missing file/module error

- [x] **Step 3: Implement folder discovery, OAuth callback storage, and mailbox detail UI**

```ts
// packages/mail/src/outlook/profile.ts
import { MICROSOFT_GRAPH_BASE_URL } from "./constants";

export async function getOutlookProfile(accessToken: string) {
  const response = await fetch(`${MICROSOFT_GRAPH_BASE_URL}/me?$select=id,mail,userPrincipalName,displayName`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(`Outlook profile fetch failed: ${response.status}`);

  const body = (await response.json()) as {
    mail: string | null;
    userPrincipalName: string;
    displayName: string;
  };

  return {
    emailAddress: body.mail ?? body.userPrincipalName,
    displayName: body.displayName,
  };
}
```

```ts
// packages/mail/src/outlook/folders.ts
import { MICROSOFT_GRAPH_BASE_URL } from "./constants";

export function mapOutlookFolders(folders: Array<{ id: string; displayName: string; wellKnownName?: string }>) {
  return folders.map((folder) => ({
    id: folder.id,
    name: folder.displayName,
    kind: folder.wellKnownName ? "system" : "custom",
    selected: folder.wellKnownName === "inbox",
  }));
}

export async function listOutlookFolders(accessToken: string) {
  const response = await fetch(`${MICROSOFT_GRAPH_BASE_URL}/me/mailFolders?$top=100&$select=id,displayName,wellKnownName`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(`Outlook folders fetch failed: ${response.status}`);

  const body = (await response.json()) as {
    value: Array<{ id: string; displayName: string; wellKnownName?: string }>;
  };

  return mapOutlookFolders(body.value);
}
```

```ts
// packages/api/src/mailboxes/repository.ts (append Outlook creator)
async createOutlookMailbox(input: {
  address: string;
  selectedFolders: Array<{ id: string; name: string; kind: string; selected: boolean }>;
}) {
  const [createdMailbox] = await db.insert(mailbox).values({
    address: input.address,
    provider: "outlook",
    authType: "oauth",
    status: "active",
    selectedFoldersJson: JSON.stringify(input.selectedFolders.filter((folder) => folder.selected).map((folder) => folder.id)),
  }).returning();

  await db.insert(mailboxFolder).values(
    input.selectedFolders.map((folder) => ({
      mailboxId: createdMailbox.id,
      providerFolderId: folder.id,
      displayName: folder.name,
      kind: folder.kind,
      selected: folder.selected,
    })),
  );

  await db.insert(outlookMailboxState).values({
    mailboxId: createdMailbox.id,
    outlookAddress: input.address,
  });

  return createdMailbox;
}
```

```ts
// apps/server/src/index.ts (new routes only)
import { buildOutlookAuthUrl, exchangeOutlookCode, getOutlookProfile, listOutlookFolders } from "@email-relay/mail/outlook";
import { parseOutlookOauthState, signOutlookOauthState } from "@email-relay/mail/outlook/oauth-state";

app.get("/oauth/outlook/start", async (c) => {
  const state = await signOutlookOauthState(c.env.MAILBOX_OAUTH_STATE_SECRET, {
    provider: "outlook",
    redirectTo: c.req.query("redirectTo") ?? "/mailboxes",
  });

  return c.redirect(
    buildOutlookAuthUrl({
      clientId: c.env.MICROSOFT_CLIENT_ID,
      redirectUri: c.env.MICROSOFT_OAUTH_REDIRECT_URL,
      state,
    }),
  );
});

app.get("/oauth/outlook/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  if (!code || !state) return c.text("Missing Outlook OAuth params", 400);

  await parseOutlookOauthState(c.env.MAILBOX_OAUTH_STATE_SECRET, state);
  const tokens = await exchangeOutlookCode({
    code,
    clientId: c.env.MICROSOFT_CLIENT_ID,
    clientSecret: c.env.MICROSOFT_CLIENT_SECRET,
    redirectUri: c.env.MICROSOFT_OAUTH_REDIRECT_URL,
  });

  const profile = await getOutlookProfile(tokens.access_token);
  const folders = await listOutlookFolders(tokens.access_token);

  const db = createDb();
  const mailboxRepo = createMailboxRepository(db);
  const credentialStore = createMailboxCredentialStore(db, c.env.MAILBOX_CREDENTIALS_SECRET);
  const mailboxRecord = await mailboxRepo.createOutlookMailbox({
    address: profile.emailAddress,
    selectedFolders: folders,
  });

  await credentialStore.saveOauthTokens({
    mailboxId: mailboxRecord.id,
    provider: "outlook",
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
    scope: tokens.scope,
    tokenType: tokens.token_type,
  });

  return c.redirect(`${c.env.CORS_ORIGIN}/mailboxes/${mailboxRecord.id}`);
});
```

```env
# apps/server/.env (append)
MICROSOFT_CLIENT_ID=replace-with-entra-app-client-id
MICROSOFT_CLIENT_SECRET=replace-with-entra-app-client-secret
MICROSOFT_OAUTH_REDIRECT_URL=https://email-relay-server-mageia.mageia.workers.dev/oauth/outlook/callback
MICROSOFT_NOTIFICATION_SECRET=replace-with-random-client-state
```

- [ ] **Step 4: Verify connect flow and folder selection**

Run: `pnpm exec vitest run packages/mail/src/outlook/folders.test.ts`  
Expected: PASS

Run: `pnpm run check-types`  
Expected: PASS

Run: `pnpm run deploy`  
Expected: Outlook OAuth succeeds, mailbox detail page shows discovered folders, and Inbox is pre-selected

- [ ] **Step 5: Commit the Outlook connect flow**

```bash
git add packages/mail/src/outlook/profile.ts packages/mail/src/outlook/folders.ts packages/api/src/mailboxes/repository.ts packages/api/src/routers/mailboxes.ts apps/server/src/index.ts packages/infra/alchemy.run.ts apps/server/.env apps/web/src/routes/_protected/mailboxes.tsx apps/web/src/routes/_protected/mailboxes/$mailboxId.tsx
git commit -m "feat: add outlook mailbox connect flow"
```

### Task 3: Implement initial Outlook delta sync and inbox upserts

**Files:**
- Create: `packages/mail/src/outlook/message.ts`
- Create: `packages/mail/src/outlook/message.test.ts`
- Create: `packages/mail/src/outlook/delta.ts`
- Modify: `apps/server/src/mail/queue.ts`
- Modify: `packages/api/src/inbox/repository.ts`

- [ ] **Step 1: Write the failing Graph message normalization test**

```ts
// packages/mail/src/outlook/message.test.ts
import { describe, expect, it } from "vitest";

import { normalizeOutlookMessage } from "./message";

describe("normalizeOutlookMessage", () => {
  it("maps a Graph message into the inbox storage shape", () => {
    const normalized = normalizeOutlookMessage({
      id: "graph-message-1",
      subject: "Quarterly update",
      bodyPreview: "Preview text",
      body: { contentType: "html", content: "<p>Hello</p>" },
      receivedDateTime: "2026-04-12T06:00:00Z",
      sentDateTime: "2026-04-12T05:58:00Z",
      from: { emailAddress: { address: "sender@example.com", name: "Sender" } },
      toRecipients: [{ emailAddress: { address: "admin@example.com", name: "Admin" } }],
      ccRecipients: [],
      isRead: false,
      internetMessageId: "<message@example.com>",
    });

    expect(normalized.subject).toBe("Quarterly update");
    expect(normalized.bodyHtml).toContain("Hello");
    expect(normalized.isRead).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `pnpm exec vitest run packages/mail/src/outlook/message.test.ts`  
Expected: FAIL with missing module error

- [x] **Step 3: Implement delta helper and queue branch**

```ts
// packages/mail/src/outlook/message.ts
function mapRecipients(value: Array<{ emailAddress?: { address?: string; name?: string } }> | undefined) {
  return JSON.stringify(
    (value ?? []).map((recipient) => ({
      address: recipient.emailAddress?.address ?? "",
      name: recipient.emailAddress?.name ?? "",
    })),
  );
}

export function normalizeOutlookMessage(message: any) {
  return {
    providerMessageId: message.id,
    internetMessageId: message.internetMessageId ?? null,
    subject: message.subject ?? "",
    snippet: message.bodyPreview ?? "",
    fromJson: mapRecipients(message.from ? [message.from] : []),
    toJson: mapRecipients(message.toRecipients),
    ccJson: mapRecipients(message.ccRecipients),
    bodyHtml: message.body?.contentType?.toLowerCase() === "html" ? message.body.content ?? "" : "",
    bodyText: message.body?.contentType?.toLowerCase() === "text" ? message.body.content ?? "" : message.bodyPreview ?? "",
    isRead: Boolean(message.isRead),
    receivedAt: new Date(message.receivedDateTime),
    sentAt: message.sentDateTime ? new Date(message.sentDateTime) : null,
    attachments: [],
  };
}
```

```ts
// packages/mail/src/outlook/delta.ts
import { MICROSOFT_GRAPH_BASE_URL } from "./constants";

export async function getOutlookDeltaPage(input: {
  accessToken: string;
  deltaLink?: string;
  folderIds?: string[];
}) {
  const targetUrl = input.deltaLink
    ? input.deltaLink
    : `${MICROSOFT_GRAPH_BASE_URL}/me/messages/delta?$select=id,subject,body,bodyPreview,from,toRecipients,ccRecipients,receivedDateTime,sentDateTime,isRead,internetMessageId&$top=50`;

  const response = await fetch(targetUrl, {
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      Prefer: 'outlook.body-content-type="html"',
    },
  });
  if (!response.ok) throw new Error(`Outlook delta failed: ${response.status}`);

  return response.json() as Promise<{
    value: any[];
    "@odata.nextLink"?: string;
    "@odata.deltaLink"?: string;
  }>;
}
```

```ts
// apps/server/src/mail/queue.ts (append the Outlook branch)
if (payload.provider === "outlook") {
  const credentials = await credentialStore.readOauthTokens(payload.mailboxId);
  if (!credentials?.accessToken) throw new Error(`Missing Outlook credentials for ${payload.mailboxId}`);

  const deltaPage = await getOutlookDeltaPage({
    accessToken: credentials.accessToken,
    deltaLink: payload.deltaLink,
  });

  for (const graphMessage of deltaPage.value) {
    if (!graphMessage.id) continue;
    const normalized = normalizeOutlookMessage(graphMessage);
    await upsertNormalizedMessage(db, {
      mailboxId: payload.mailboxId,
      ...normalized,
    });
  }

  await db.update(outlookMailboxState).set({
    deltaLink: deltaPage["@odata.deltaLink"] ?? payload.deltaLink ?? null,
    lastDeltaSyncAt: new Date(),
  }).where(eq(outlookMailboxState.mailboxId, payload.mailboxId));

  if (deltaPage["@odata.nextLink"]) {
    await env.MAIL_SYNC_QUEUE.send({
      provider: "outlook",
      mailboxId: payload.mailboxId,
      reason: "outlook-delta",
      deltaLink: deltaPage["@odata.nextLink"],
    });
  }

  message.ack();
  continue;
}
```

- [ ] **Step 4: Run verification and check inbox visibility**

Run: `pnpm exec vitest run packages/mail/src/outlook/message.test.ts`  
Expected: PASS

Run: `pnpm run check-types`  
Expected: PASS

Run: `pnpm run deploy`  
Expected: connecting an Outlook mailbox enqueues `outlook-initial` and Outlook messages appear in `/inbox`

- [ ] **Step 5: Commit the Outlook delta sync slice**

```bash
git add packages/mail/src/outlook/message.ts packages/mail/src/outlook/message.test.ts packages/mail/src/outlook/delta.ts apps/server/src/mail/queue.ts packages/api/src/inbox/repository.ts
git commit -m "feat: sync outlook messages via graph delta"
```

### Task 4: Add Microsoft Graph change notifications and renewal scheduling

**Files:**
- Create: `packages/mail/src/outlook/subscription.ts`
- Create: `apps/server/src/mail/outlook-webhook.ts`
- Modify: `apps/server/src/mail/scheduled.ts`
- Modify: `apps/server/src/index.ts`
- Modify: `packages/infra/alchemy.run.ts`

- [ ] **Step 1: Write the failing subscription validation test**

```ts
// packages/mail/src/outlook/subscription.test.ts
import { describe, expect, it } from "vitest";

import { buildOutlookSubscriptionRequest } from "./subscription";

describe("buildOutlookSubscriptionRequest", () => {
  it("creates a message subscription payload with a client state token", () => {
    const payload = buildOutlookSubscriptionRequest({
      notificationUrl: "https://example.com/webhooks/outlook/notifications",
      clientState: "secret",
      resource: "/me/messages",
      expiresAt: new Date("2026-04-13T00:00:00Z"),
    });

    expect(payload.clientState).toBe("secret");
    expect(payload.resource).toBe("/me/messages");
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `pnpm exec vitest run packages/mail/src/outlook/subscription.test.ts`  
Expected: FAIL with missing module error

- [x] **Step 3: Implement subscription create/renew and webhook validation**

```ts
// packages/mail/src/outlook/subscription.ts
import { MICROSOFT_GRAPH_BASE_URL } from "./constants";

export function buildOutlookSubscriptionRequest(input: {
  notificationUrl: string;
  clientState: string;
  resource: string;
  expiresAt: Date;
}) {
  return {
    changeType: "created,updated",
    notificationUrl: input.notificationUrl,
    resource: input.resource,
    expirationDateTime: input.expiresAt.toISOString(),
    clientState: input.clientState,
  };
}

export async function createOutlookSubscription(accessToken: string, input: Parameters<typeof buildOutlookSubscriptionRequest>[0]) {
  const response = await fetch(`${MICROSOFT_GRAPH_BASE_URL}/subscriptions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildOutlookSubscriptionRequest(input)),
  });
  if (!response.ok) throw new Error(`Graph subscription failed: ${response.status}`);
  return response.json() as Promise<{ id: string; expirationDateTime: string; resource: string }>;
}
```

```ts
// apps/server/src/mail/outlook-webhook.ts
import { eq } from "drizzle-orm";

import { createDb } from "@email-relay/db";
import { mailbox } from "@email-relay/db/schema/mail";
import { outlookMailboxState } from "@email-relay/db/schema/outlook";

export async function handleOutlookWebhook(request: Request, env: Env) {
  const url = new URL(request.url);
  const validationToken = url.searchParams.get("validationToken");
  if (validationToken) {
    return new Response(validationToken, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  const body = (await request.json()) as {
    value?: Array<{ subscriptionId: string; clientState: string; resourceData?: { id?: string } }>;
  };

  if (!body.value?.length) return new Response("Ignored", { status: 202 });
  if (body.value.some((item) => item.clientState !== env.MICROSOFT_NOTIFICATION_SECRET)) {
    return new Response("Forbidden", { status: 403 });
  }

  const db = createDb();
  for (const item of body.value) {
    const state = await db.query.outlookMailboxState.findFirst({
      where: eq(outlookMailboxState.subscriptionId, item.subscriptionId),
    });
    if (!state) continue;

    await env.MAIL_SYNC_QUEUE.send({
      provider: "outlook",
      mailboxId: state.mailboxId,
      reason: "outlook-delta",
      deltaLink: state.deltaLink ?? undefined,
    });
  }

  return new Response("Accepted", { status: 202 });
}
```

```ts
// apps/server/src/mail/scheduled.ts (append Outlook branch)
const expiringSubscriptions = await db
  .select({ mailboxId: outlookMailboxState.mailboxId, deltaLink: outlookMailboxState.deltaLink, subscriptionId: outlookMailboxState.subscriptionId })
  .from(outlookMailboxState)
  .where(lt(outlookMailboxState.subscriptionExpiresAt, new Date(Date.now() + 12 * 60 * 60 * 1000)));

for (const row of expiringSubscriptions) {
  const credentials = await credentialStore.readOauthTokens(row.mailboxId);
  if (!credentials?.accessToken) continue;

  const renewed = await createOutlookSubscription(credentials.accessToken, {
    notificationUrl: `${env.BETTER_AUTH_URL}/webhooks/outlook/notifications`,
    clientState: env.MICROSOFT_NOTIFICATION_SECRET,
    resource: "/me/messages",
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  });

  await db.update(outlookMailboxState).set({
    subscriptionId: renewed.id,
    subscriptionResource: renewed.resource,
    subscriptionExpiresAt: new Date(renewed.expirationDateTime),
  }).where(eq(outlookMailboxState.mailboxId, row.mailboxId));
}
```

- [ ] **Step 4: Verify Graph notifications and renewal**

Run: `pnpm exec vitest run packages/mail/src/outlook/subscription.test.ts`  
Expected: PASS

Run: `pnpm run check-types`  
Expected: PASS

Run: `pnpm run deploy`  
Expected:
- Graph validates `/webhooks/outlook/notifications`
- subscription rows are created in `outlook_mailbox_state`
- new messages trigger queue payloads and show up in `/inbox`
- scheduled renewals keep `subscriptionExpiresAt` in the future

- [ ] **Step 5: Commit the Outlook incremental-notification path**

```bash
git add packages/mail/src/outlook/subscription.ts apps/server/src/mail/outlook-webhook.ts apps/server/src/mail/scheduled.ts apps/server/src/index.ts packages/infra/alchemy.run.ts
git commit -m "feat: add outlook notifications and renewal"
```

### Task 5: Finish Cloudflare verification and Outlook operator docs

**Files:**
- Modify: `README.md`

- [x] **Step 1: Document the Microsoft prerequisites**

```md
## Outlook / Microsoft 365 setup

1. Create a Microsoft Entra app registration.
2. Add a web redirect URI: `https://<server-url>/oauth/outlook/callback`.
3. Grant delegated permissions for `Mail.Read`, `MailboxSettings.Read`, `offline_access`, `openid`, `profile`, and `email`.
4. Configure the notification URL `https://<server-url>/webhooks/outlook/notifications`.
5. Set `MICROSOFT_NOTIFICATION_SECRET` and use the same value as Graph `clientState`.
```

- [ ] **Step 2: Verify the end-to-end production checklist**

Run:

```bash
set -a
source ./.env
set +a
pnpm run deploy
```

Expected checklist:
- `/mailboxes` offers “连接 Outlook”
- Outlook OAuth succeeds and lands on mailbox detail
- folder selection updates `mailbox_folder`
- initial delta sync populates the inbox
- Graph validation token handshake succeeds
- new Outlook mail triggers incremental sync without reconnecting

- [ ] **Step 3: Commit the docs update**

```bash
git add README.md
git commit -m "docs: add outlook setup guide"
```

---

## Self-review

### Spec coverage
- Outlook OAuth connection: Tasks 1 and 2
- Selected folders: Task 2
- Initial sync and inbox visibility: Task 3
- Near-real-time notifications + renewal: Task 4
- Cloudflare deploy checkpoints: Tasks 2 through 5

### Placeholder scan
- No placeholders remain inside executable steps
- Gmail/IMAP work is intentionally outside this plan

### Type consistency
- Outlook provider identifier is consistently `"outlook"`
- `outlookMailboxState` is the single state table for Graph cursors/subscriptions
- `MailSyncPayloadSchema` remains the queue entry point
