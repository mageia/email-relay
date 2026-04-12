# Generic IMAP Connector & Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add generic IMAP mailbox connection with auto-discovery-first setup, manual fallback fields, folder selection, initial sync, incremental polling, and Cloudflare deployment verification so non-Gmail/Outlook mailboxes appear in the unified inbox.

**Architecture:** Reuse the shared credential store and queue contract from the Gmail plan, then add a minimal Worker-compatible IMAP stack in `packages/mail` built on Cloudflare TCP sockets plus MIME parsing. Persist discovered server settings, selected folders, and per-folder sync cursors in D1 so IMAP can participate in the same inbox UI and sync-job pipeline as OAuth providers.

**Tech Stack:** Hono, oRPC, Drizzle ORM, Cloudflare Workers, Cloudflare TCP sockets (`connect()`), Cloudflare Queues, Cloudflare Cron Triggers, IMAP4rev1, `postal-mime`, Vitest

---

## Scope split

This plan assumes the control-plane foundation and the shared mail package from the Gmail plan already exist. It only adds **generic IMAP**. Outlook remains a separate plan.

## File structure map

### Create
- `packages/mail/src/imap/constants.ts` — IMAP default ports, TLS modes, and provider identifiers
- `packages/mail/src/imap/discovery.ts` — provider preset + SRV + hostname heuristic discovery chain
- `packages/mail/src/imap/discovery.test.ts` — discovery tests
- `packages/mail/src/imap/socket.ts` — Worker-compatible IMAP socket wrapper built on `cloudflare:sockets`
- `packages/mail/src/imap/socket.test.ts` — parser/command framing tests
- `packages/mail/src/imap/client.ts` — minimal IMAP commands: CAPABILITY, LOGIN, LIST, SELECT, UID SEARCH, UID FETCH, LOGOUT
- `packages/mail/src/imap/folders.ts` — folder normalization and selection helpers
- `packages/mail/src/imap/message.ts` — raw RFC822 / BODYSTRUCTURE normalization with `postal-mime`
- `packages/mail/src/imap/message.test.ts` — MIME normalization tests
- `packages/mail/src/imap/poll.ts` — incremental polling helpers and cursor advancement logic
- `packages/db/src/schema/imap.ts` — IMAP mailbox state, discovered settings, and per-folder cursors
- `apps/server/src/mail/imap-validate.ts` — connection validation + folder discovery helper invoked by API routes
- `apps/web/src/components/connect-imap-form.tsx` — auto-discovery with manual fallback form
- `apps/web/src/components/imap-settings-form.tsx` — edit server settings / selected folders UI

### Modify
- `packages/mail/package.json` — add `postal-mime` dependency
- `packages/mail/src/index.ts` — export IMAP helpers
- `packages/mail/src/sync/payload.ts` — add IMAP sync payload branch
- `packages/db/src/schema/index.ts` — export `imap.ts`
- `packages/db/src/index.ts` — include IMAP schema
- `packages/api/src/mailboxes/repository.ts` — add IMAP mailbox creation + settings updates
- `packages/api/src/routers/mailboxes.ts` — add IMAP discovery / validate / connect / update procedures
- `apps/server/src/index.ts` — add IMAP validate endpoint if not routed through oRPC only
- `apps/server/src/mail/queue.ts` — handle IMAP sync jobs
- `apps/server/src/mail/scheduled.ts` — poll IMAP folders on cron
- `packages/infra/alchemy.run.ts` — add cron coverage and any IMAP-related env flags
- `apps/server/.env` — add local IMAP test account env vars if using fixture validation
- `apps/web/src/routes/_protected/mailboxes.tsx` — add IMAP connect CTA
- `apps/web/src/routes/_protected/mailboxes/$mailboxId.tsx` — support IMAP settings / selected folders
- `README.md` — document IMAP discovery behavior and app-password expectations

---

### Task 1: Add IMAP schema, discovery chain, and queue payload branch

**Files:**
- Create: `packages/mail/src/imap/constants.ts`
- Create: `packages/mail/src/imap/discovery.ts`
- Create: `packages/mail/src/imap/discovery.test.ts`
- Create: `packages/db/src/schema/imap.ts`
- Modify: `packages/mail/src/index.ts`
- Modify: `packages/mail/src/sync/payload.ts`
- Modify: `packages/db/src/schema/index.ts`
- Modify: `packages/db/src/index.ts`

- [ ] **Step 1: Write the failing discovery and payload tests**

```ts
// packages/mail/src/imap/discovery.test.ts
import { describe, expect, it } from "vitest";

import { applyDiscoveryFallbacks } from "./discovery";

describe("applyDiscoveryFallbacks", () => {
  it("falls back to imap.<domain> and port 993 when no provider preset exists", () => {
    expect(applyDiscoveryFallbacks("example.com")).toEqual({
      host: "imap.example.com",
      port: 993,
      secure: true,
      authType: "password",
    });
  });
});
```

```ts
// packages/mail/src/sync/payload.test.ts (append this test)
it("accepts an IMAP poll payload", () => {
  expect(
    MailSyncPayloadSchema.parse({
      provider: "imap",
      mailboxId: "mailbox-3",
      reason: "imap-poll",
      folderIds: ["INBOX"],
    }),
  ).toMatchObject({ provider: "imap", mailboxId: "mailbox-3" });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `pnpm exec vitest run packages/mail/src/imap/discovery.test.ts packages/mail/src/sync/payload.test.ts`  
Expected: FAIL with missing module errors

- [x] **Step 3: Implement discovery helpers, payload support, and IMAP schema**

```ts
// packages/mail/src/imap/constants.ts
export const IMAP_PROVIDER = "imap";
export const IMAP_TLS_PORT = 993;
export const IMAP_STARTTLS_PORT = 143;

export const IMAP_PROVIDER_PRESETS: Record<string, { host: string; port: number; secure: boolean; authType: "password" | "app-password" }> = {
  "qq.com": { host: "imap.qq.com", port: 993, secure: true, authType: "app-password" },
  "163.com": { host: "imap.163.com", port: 993, secure: true, authType: "app-password" },
  "outlook.com": { host: "outlook.office365.com", port: 993, secure: true, authType: "password" },
};
```

```ts
// packages/mail/src/imap/discovery.ts
import { IMAP_PROVIDER_PRESETS, IMAP_TLS_PORT } from "./constants";

export function applyDiscoveryFallbacks(domain: string) {
  const preset = IMAP_PROVIDER_PRESETS[domain];
  if (preset) return preset;

  return {
    host: `imap.${domain}`,
    port: IMAP_TLS_PORT,
    secure: true,
    authType: "password" as const,
  };
}

export async function discoverImapSettings(input: {
  domain: string;
  resolveSrv?: (record: string) => Promise<Array<{ priority: number; name: string; port: number }>>;
}) {
  const srvRecords = input.resolveSrv ? await input.resolveSrv(`_imaps._tcp.${input.domain}`) : [];
  if (srvRecords.length > 0) {
    const sorted = [...srvRecords].sort((left, right) => left.priority - right.priority);
    return {
      host: sorted[0].name,
      port: sorted[0].port,
      secure: true,
      authType: "password" as const,
      source: "srv" as const,
    };
  }

  return {
    ...applyDiscoveryFallbacks(input.domain),
    source: "fallback" as const,
  };
}
```

```ts
// packages/db/src/schema/imap.ts
import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { mailbox } from "./mail";

export const imapMailboxState = sqliteTable("imap_mailbox_state", {
  mailboxId: text("mailbox_id").primaryKey().references(() => mailbox.id, { onDelete: "cascade" }),
  username: text("username").notNull(),
  host: text("host").notNull(),
  port: integer("port").notNull(),
  secure: integer("secure", { mode: "boolean" }).notNull().default(true),
  authType: text("auth_type").notNull(),
  discoverySource: text("discovery_source").notNull().default("fallback"),
  lastValidatedAt: integer("last_validated_at", { mode: "timestamp_ms" }),
  lastPollAt: integer("last_poll_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .$onUpdate(() => new Date())
    .notNull(),
});

export const imapFolderCursor = sqliteTable("imap_folder_cursor", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  mailboxId: text("mailbox_id").notNull().references(() => mailbox.id, { onDelete: "cascade" }),
  folderId: text("folder_id").notNull(),
  uidValidity: text("uid_validity"),
  lastSeenUid: integer("last_seen_uid"),
  lastPolledAt: integer("last_polled_at", { mode: "timestamp_ms" }),
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
// packages/mail/src/sync/payload.ts (add branch)
z.object({
  provider: z.literal("imap"),
  mailboxId: z.string().min(1),
  reason: z.enum(["imap-initial", "imap-poll", "imap-backfill"]),
  folderIds: z.array(z.string()).optional(),
  pageToken: z.string().optional(),
}),
```

- [x] **Step 4: Run tests, migration generation, and type checks**

Run: `pnpm exec vitest run packages/mail/src/imap/discovery.test.ts packages/mail/src/sync/payload.test.ts`  
Expected: PASS

Run: `pnpm run db:generate`  
Expected: migration for `imap_mailbox_state` and `imap_folder_cursor`

Run: `pnpm run check-types`  
Expected: PASS

- [ ] **Step 5: Commit the IMAP foundation**

```bash
git add packages/mail/src/imap/constants.ts packages/mail/src/imap/discovery.ts packages/mail/src/imap/discovery.test.ts packages/mail/src/sync/payload.ts packages/db/src/schema/imap.ts packages/db/src/schema/index.ts packages/db/src/index.ts packages/db/src/migrations
git commit -m "feat: add imap discovery and state foundation"
```

### Task 2: Implement Worker-compatible IMAP validation, folder listing, and connect UI

**Files:**
- Create: `packages/mail/src/imap/socket.ts`
- Create: `packages/mail/src/imap/socket.test.ts`
- Create: `packages/mail/src/imap/client.ts`
- Create: `packages/mail/src/imap/folders.ts`
- Create: `apps/server/src/mail/imap-validate.ts`
- Create: `apps/web/src/components/connect-imap-form.tsx`
- Create: `apps/web/src/components/imap-settings-form.tsx`
- Modify: `packages/api/src/mailboxes/repository.ts`
- Modify: `packages/api/src/routers/mailboxes.ts`
- Modify: `apps/server/src/index.ts`
- Modify: `apps/web/src/routes/_protected/mailboxes.tsx`
- Modify: `apps/web/src/routes/_protected/mailboxes/$mailboxId.tsx`

- [ ] **Step 1: Write the failing IMAP framing and folder mapping tests**

```ts
// packages/mail/src/imap/socket.test.ts
import { describe, expect, it } from "vitest";

import { splitImapLines } from "./socket";

describe("splitImapLines", () => {
  it("splits CRLF-delimited socket chunks into protocol lines", () => {
    expect(splitImapLines("* OK ready\r\nA1 CAPABILITY\r\n")).toEqual([
      "* OK ready",
      "A1 CAPABILITY",
    ]);
  });
});
```

```ts
// packages/mail/src/imap/folders.test.ts
import { describe, expect, it } from "vitest";

import { normalizeImapFolders } from "./folders";

describe("normalizeImapFolders", () => {
  it("marks INBOX selected by default and leaves custom folders unselected", () => {
    expect(normalizeImapFolders(["INBOX", "Projects/Client A"]))
      .toEqual([
        { id: "INBOX", name: "INBOX", kind: "system", selected: true },
        { id: "Projects/Client A", name: "Projects/Client A", kind: "custom", selected: false },
      ]);
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `pnpm exec vitest run packages/mail/src/imap/socket.test.ts packages/mail/src/imap/folders.test.ts`  
Expected: FAIL with missing module errors

- [x] **Step 3: Implement the IMAP socket/client, validation endpoint, and connect UI**

```ts
// packages/mail/src/imap/socket.ts
import { connect } from "cloudflare:sockets";

export function splitImapLines(chunk: string) {
  return chunk.split("\r\n").filter(Boolean);
}

export async function openImapSocket(input: { host: string; port: number; secure: boolean }) {
  return connect({
    hostname: input.host,
    port: input.port,
    secureTransport: input.secure ? "on" : "starttls",
  });
}
```

```ts
// packages/mail/src/imap/client.ts
import { openImapSocket, splitImapLines } from "./socket";

export async function validateImapLogin(input: {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
}) {
  const socket = await openImapSocket(input);
  const writer = socket.writable.getWriter();
  const reader = socket.readable.getReader();

  const responses: string[] = [];
  const readChunk = async () => {
    const { value, done } = await reader.read();
    if (done || !value) return;
    responses.push(...splitImapLines(new TextDecoder().decode(value)));
  };

  await readChunk(); // greeting
  await writer.write(new TextEncoder().encode(`A1 LOGIN \"${input.username}\" \"${input.password}\"\r\n`));
  await readChunk();
  await writer.write(new TextEncoder().encode("A2 LIST \"\" \"*\"\r\n"));
  await readChunk();
  await writer.write(new TextEncoder().encode("A3 LOGOUT\r\n"));

  const ok = responses.some((line) => line.includes("A1 OK"));
  if (!ok) throw new Error("IMAP login failed");

  const folders = responses
    .filter((line) => line.startsWith("* LIST"))
    .map((line) => line.split(' "/" ').pop()?.replace(/^"|"$/g, "") ?? "")
    .filter(Boolean);

  return { folders };
}
```

```ts
// packages/mail/src/imap/folders.ts
export function normalizeImapFolders(folders: string[]) {
  return folders.map((folder) => ({
    id: folder,
    name: folder,
    kind: folder.toUpperCase() === "INBOX" ? "system" : "custom",
    selected: folder.toUpperCase() === "INBOX",
  }));
}
```

```ts
// apps/server/src/mail/imap-validate.ts
import { normalizeImapFolders, validateImapLogin } from "@email-relay/mail/imap/client";

export async function validateImapMailbox(input: {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
}) {
  const result = await validateImapLogin(input);
  return {
    folders: normalizeImapFolders(result.folders),
  };
}
```

```tsx
// apps/web/src/components/connect-imap-form.tsx
import { Button } from "@email-relay/ui/components/button";
import { Input } from "@email-relay/ui/components/input";
import { Label } from "@email-relay/ui/components/label";
import { useForm } from "@tanstack/react-form";

export default function ConnectImapForm({
  onSubmit,
  isSubmitting,
}: {
  onSubmit: (value: {
    email: string;
    username: string;
    password: string;
    host?: string;
    port?: number;
    secure?: boolean;
  }) => Promise<void>;
  isSubmitting: boolean;
}) {
  const form = useForm({
    defaultValues: {
      email: "",
      username: "",
      password: "",
      host: "",
      port: 993,
      secure: true,
    },
    onSubmit: async ({ value }) => onSubmit(value),
  });

  return (
    <form className="space-y-4 rounded-xl border p-4" onSubmit={(event) => { event.preventDefault(); form.handleSubmit(); }}>
      <div className="space-y-2"><Label htmlFor="email">邮箱地址</Label><Input id="email" value={form.state.values.email} onChange={(event) => form.setFieldValue("email", event.target.value)} /></div>
      <div className="space-y-2"><Label htmlFor="username">用户名</Label><Input id="username" value={form.state.values.username} onChange={(event) => form.setFieldValue("username", event.target.value)} /></div>
      <div className="space-y-2"><Label htmlFor="password">密码 / 应用专用密码</Label><Input id="password" type="password" value={form.state.values.password} onChange={(event) => form.setFieldValue("password", event.target.value)} /></div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="host">手动 Host（可选）</Label><Input id="host" value={form.state.values.host} onChange={(event) => form.setFieldValue("host", event.target.value)} /></div>
        <div className="space-y-2"><Label htmlFor="port">手动 Port（可选）</Label><Input id="port" type="number" value={String(form.state.values.port)} onChange={(event) => form.setFieldValue("port", Number(event.target.value))} /></div>
      </div>
      <Button type="submit" disabled={isSubmitting}>{isSubmitting ? "验证中..." : "验证并连接 IMAP"}</Button>
    </form>
  );
}
```

- [ ] **Step 4: Verify local validation and mailbox creation flow**

Run: `pnpm exec vitest run packages/mail/src/imap/socket.test.ts packages/mail/src/imap/folders.test.ts`  
Expected: PASS

Run: `pnpm run check-types`  
Expected: PASS

Run: `pnpm run deploy`  
Expected: submitting the IMAP form either auto-discovers settings or uses manual values, validates the mailbox, and creates an IMAP mailbox row with selected folders

- [ ] **Step 5: Commit the IMAP connect flow**

```bash
git add packages/mail/src/imap/socket.ts packages/mail/src/imap/socket.test.ts packages/mail/src/imap/client.ts packages/mail/src/imap/folders.ts apps/server/src/mail/imap-validate.ts apps/web/src/components/connect-imap-form.tsx apps/web/src/components/imap-settings-form.tsx packages/api/src/mailboxes/repository.ts packages/api/src/routers/mailboxes.ts apps/server/src/index.ts apps/web/src/routes/_protected/mailboxes.tsx apps/web/src/routes/_protected/mailboxes/$mailboxId.tsx
git commit -m "feat: add imap connect and folder discovery flow"
```

### Task 3: Implement initial IMAP message sync and MIME normalization

**Files:**
- Create: `packages/mail/src/imap/message.ts`
- Create: `packages/mail/src/imap/message.test.ts`
- Modify: `packages/mail/package.json`
- Modify: `apps/server/src/mail/queue.ts`

- [ ] **Step 1: Write the failing MIME normalization test**

```ts
// packages/mail/src/imap/message.test.ts
import { describe, expect, it } from "vitest";

import { normalizeImapMessage } from "./message";

describe("normalizeImapMessage", () => {
  it("parses a raw MIME message into the inbox shape", async () => {
    const raw = [
      "From: Sender <sender@example.com>",
      "To: Admin <admin@example.com>",
      "Subject: IMAP hello",
      "Date: Sun, 12 Apr 2026 08:00:00 +0000",
      "Content-Type: text/plain; charset=UTF-8",
      "",
      "hello from imap",
      "",
    ].join("\r\n");

    const normalized = await normalizeImapMessage({
      uid: 42,
      raw,
      folderId: "INBOX",
      internalDate: new Date("2026-04-12T08:00:00Z"),
    });

    expect(normalized.subject).toBe("IMAP hello");
    expect(normalized.bodyText).toContain("hello from imap");
    expect(normalized.providerMessageId).toBe("INBOX:42");
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `pnpm exec vitest run packages/mail/src/imap/message.test.ts`  
Expected: FAIL because MIME parsing is not implemented yet

- [x] **Step 3: Add `postal-mime` and implement initial sync in the queue worker**

```json
// packages/mail/package.json (append dependency)
{
  "dependencies": {
    "postal-mime": "^2.4.4"
  }
}
```

```ts
// packages/mail/src/imap/message.ts
import PostalMime from "postal-mime";

export async function normalizeImapMessage(input: {
  uid: number;
  raw: string;
  folderId: string;
  internalDate: Date;
}) {
  const parser = new PostalMime();
  const parsed = await parser.parse(input.raw);

  return {
    providerMessageId: `${input.folderId}:${input.uid}`,
    internetMessageId: parsed.messageId ?? null,
    subject: parsed.subject ?? "",
    snippet: (parsed.text ?? parsed.html ?? "").slice(0, 160),
    fromJson: JSON.stringify(parsed.from ? [parsed.from] : []),
    toJson: JSON.stringify(parsed.to ?? []),
    ccJson: JSON.stringify(parsed.cc ?? []),
    bodyHtml: parsed.html ?? "",
    bodyText: parsed.text ?? "",
    isRead: false,
    receivedAt: input.internalDate,
    sentAt: parsed.date ?? input.internalDate,
    attachments: (parsed.attachments ?? []).map((attachment) => ({
      filename: attachment.filename ?? "attachment",
      mimeType: attachment.mimeType ?? "application/octet-stream",
      size: attachment.content?.byteLength ?? 0,
      inline: Boolean(attachment.inline),
      cid: attachment.contentId ?? null,
    })),
  };
}
```

```ts
// apps/server/src/mail/queue.ts (append IMAP branch)
if (payload.provider === "imap") {
  const credentials = await credentialStore.readOauthTokens(payload.mailboxId);
  const imapState = await db.query.imapMailboxState.findFirst({ where: eq(imapMailboxState.mailboxId, payload.mailboxId) });
  if (!credentials?.accessToken || !imapState) {
    throw new Error(`Missing IMAP sealed password or state for ${payload.mailboxId}`);
  }

  const password = credentials.accessToken; // for IMAP we store the sealed password in accessTokenSealed
  const selectedFolders = payload.folderIds ?? (JSON.parse(mailboxRow.selectedFoldersJson) as string[]);

  for (const folderId of selectedFolders) {
    const messages = await fetchImapFolderMessages({
      host: imapState.host,
      port: imapState.port,
      secure: imapState.secure,
      username: imapState.username,
      password,
      folderId,
      sinceUid: null,
      limit: 50,
    });

    for (const messageRecord of messages) {
      const normalized = await normalizeImapMessage(messageRecord);
      await upsertNormalizedMessage(db, {
        mailboxId: payload.mailboxId,
        ...normalized,
      });
    }
  }

  message.ack();
  continue;
}
```

- [ ] **Step 4: Verify that IMAP messages reach the inbox**

Run: `pnpm exec vitest run packages/mail/src/imap/message.test.ts`  
Expected: PASS

Run: `pnpm run check-types`  
Expected: PASS

Run: `pnpm run deploy`  
Expected: connecting an IMAP mailbox creates real inbox rows from the selected folders

- [ ] **Step 5: Commit the IMAP initial sync slice**

```bash
git add packages/mail/package.json packages/mail/src/imap/message.ts packages/mail/src/imap/message.test.ts apps/server/src/mail/queue.ts
git commit -m "feat: sync imap messages into inbox"
```

### Task 4: Add IMAP incremental polling and per-folder cursor advancement

**Files:**
- Create: `packages/mail/src/imap/poll.ts`
- Modify: `apps/server/src/mail/queue.ts`
- Modify: `apps/server/src/mail/scheduled.ts`

- [ ] **Step 1: Write the failing cursor advancement test**

```ts
// packages/mail/src/imap/poll.test.ts
import { describe, expect, it } from "vitest";

import { nextUidWindow } from "./poll";

describe("nextUidWindow", () => {
  it("starts after the previously seen UID", () => {
    expect(nextUidWindow({ lastSeenUid: 100 })).toEqual({ search: "UID 101:*" });
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `pnpm exec vitest run packages/mail/src/imap/poll.test.ts`  
Expected: FAIL with missing module error

- [x] **Step 3: Implement cursor math and cron polling**

```ts
// packages/mail/src/imap/poll.ts
export function nextUidWindow(input: { lastSeenUid: number | null }) {
  return {
    search: input.lastSeenUid ? `UID ${input.lastSeenUid + 1}:*` : "ALL",
  };
}
```

```ts
// apps/server/src/mail/scheduled.ts (append IMAP polling branch)
const imapMailboxes = await db.select({
  mailboxId: imapMailboxState.mailboxId,
  lastPollAt: imapMailboxState.lastPollAt,
}).from(imapMailboxState);

for (const row of imapMailboxes) {
  await env.MAIL_SYNC_QUEUE.send({
    provider: "imap",
    mailboxId: row.mailboxId,
    reason: "imap-poll",
  });
}
```

```ts
// apps/server/src/mail/queue.ts (cursor handling snippet)
const cursor = await db.query.imapFolderCursor.findFirst({
  where: and(eq(imapFolderCursor.mailboxId, payload.mailboxId), eq(imapFolderCursor.folderId, folderId)),
});

const searchWindow = nextUidWindow({ lastSeenUid: cursor?.lastSeenUid ?? null });
const messages = await fetchImapFolderMessages({
  host: imapState.host,
  port: imapState.port,
  secure: imapState.secure,
  username: imapState.username,
  password,
  folderId,
  uidSearch: searchWindow.search,
  limit: 100,
});

const lastSeenUid = messages.length ? messages[messages.length - 1].uid : cursor?.lastSeenUid ?? null;
await db.insert(imapFolderCursor).values({
  mailboxId: payload.mailboxId,
  folderId,
  uidValidity: messages[0]?.uidValidity ?? cursor?.uidValidity ?? null,
  lastSeenUid,
  lastPolledAt: new Date(),
}).onConflictDoUpdate({
  target: imapFolderCursor.id,
  set: { uidValidity: messages[0]?.uidValidity ?? cursor?.uidValidity ?? null, lastSeenUid, lastPolledAt: new Date() },
});
```

- [ ] **Step 4: Verify incremental polling behavior**

Run: `pnpm exec vitest run packages/mail/src/imap/poll.test.ts`  
Expected: PASS

Run: `pnpm run check-types`  
Expected: PASS

Run: `pnpm run deploy`  
Expected: cron creates `imap-poll` jobs and newly arriving IMAP messages appear in `/inbox` without reconnecting the mailbox

- [ ] **Step 5: Commit the IMAP polling path**

```bash
git add packages/mail/src/imap/poll.ts apps/server/src/mail/queue.ts apps/server/src/mail/scheduled.ts
git commit -m "feat: add incremental imap polling"
```

### Task 5: Finish operator docs and Cloudflare verification for IMAP

**Files:**
- Modify: `README.md`

- [x] **Step 1: Document the discovery and manual-fallback behavior**

```md
## Generic IMAP setup

1. Enter the mailbox address first; the system tries provider presets, then SRV lookup, then `imap.<domain>` fallback.
2. If discovery fails, enter host / port / TLS manually.
3. For providers such as QQ or 163, use an IMAP app password instead of the web-login password.
4. Only selected folders are polled; INBOX is selected by default.
```

- [ ] **Step 2: Verify the production checklist**

Run:

```bash
set -a
source ./.env
set +a
pnpm run deploy
```

Expected checklist:
- `/mailboxes` offers the IMAP connect form
- discovery pre-fills settings for supported providers
- manual fallback works for unknown domains
- validated folders show up on the mailbox detail page
- initial sync populates the inbox
- cron polling picks up new IMAP messages and advances folder cursors

- [ ] **Step 3: Commit the docs update**

```bash
git add README.md
git commit -m "docs: add imap setup guide"
```

---

## Self-review

### Spec coverage
- Auto-discovery first, manual fallback: Tasks 1 and 2
- Selected folders: Task 2
- Initial IMAP sync: Task 3
- Incremental polling: Task 4
- Cloudflare deploy checkpoints: Tasks 2 through 5

### Placeholder scan
- No placeholders remain inside executable steps
- Outlook/Gmail concerns remain isolated to other plans

### Type consistency
- IMAP provider identifier is consistently `"imap"`
- `imapMailboxState` and `imapFolderCursor` are the only IMAP state tables
- Queue payloads continue to flow through `MailSyncPayloadSchema`
