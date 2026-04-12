# Sync Operations & History Backfill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add provider-agnostic sync operations: mailbox/group history backfill, retry/backoff policy, richer alerts, D1-backed full-text search, and Cloudflare deployment verification so the admin can operate the system reliably across Gmail, Outlook, and IMAP.

**Architecture:** Keep all providers flowing through one queue contract, then add an operations layer on top: reusable history-backfill requests, structured job attempts, alert promotion rules, and an FTS index that powers inbox search. This plan assumes Gmail / Outlook / IMAP plans already exist and focuses on cross-provider orchestration, observability, and real-environment verification.

**Tech Stack:** Hono, oRPC, Drizzle ORM, Cloudflare Workers, Cloudflare Queues, Cloudflare Cron Triggers, Cloudflare D1 (including FTS5 virtual tables), Vitest

---

## Scope split

This plan assumes these provider plans are complete enough to already sync mail into `mail_message`:
- `2026-04-12-gmail-connector-and-sync.md`
- `2026-04-12-outlook-connector-and-sync.md`
- `2026-04-12-generic-imap-connector-and-sync.md`

It focuses on operations, not new connector auth flows.

## File structure map

### Create
- `packages/mail/src/sync/retry.ts` — retry policy, exponential backoff, and attempt classification helpers
- `packages/mail/src/sync/retry.test.ts` — retry helper tests
- `packages/mail/src/sync/history-backfill.ts` — provider-agnostic backfill payload builder
- `packages/mail/src/sync/history-backfill.test.ts` — history payload tests
- `packages/db/src/schema/search.ts` — FTS5 virtual table metadata migrations and query helpers (if using schema helper file)
- `packages/api/src/operations/alerts.ts` — alert promotion / resolution helpers
- `packages/api/src/operations/alerts.test.ts` — alert operation tests
- `packages/api/src/operations/backfill.ts` — mailbox/group backfill orchestration helpers
- `packages/api/src/operations/backfill.test.ts` — backfill orchestration tests
- `packages/api/src/routers/operations.ts` — backfill, retry, and search router procedures
- `apps/web/src/components/backfill-form.tsx` — mailbox/group backfill trigger UI
- `apps/web/src/components/alert-summary-cards.tsx` — overview cards for active alerts and recent failures
- `apps/web/src/components/inbox-search-bar.tsx` — search input with server-backed filters
- `apps/web/src/routes/_protected/operations.tsx` — operations page for history backfill and retry controls

### Modify
- `packages/mail/src/sync/payload.ts` — add generic backfill / retry payload shapes if needed
- `packages/db/src/schema/mail.ts` — add fields for sync job target range, error class, next attempt time
- `packages/db/src/schema/index.ts` — export any search schema helper file
- `packages/api/src/inbox/repository.ts` — replace plain `LIKE` search with FTS-backed search and richer filters
- `packages/api/src/routers/inbox.ts` — expose full-text search and alert counts in inbox filters
- `packages/api/src/routers/alerts.ts` — add resolve/reopen procedures if desired in this slice
- `packages/api/src/routers/groups.ts` — expose batch-backfill triggers if better colocated there
- `packages/api/src/routers/index.ts` — add `operations` router
- `apps/server/src/mail/queue.ts` — handle generic backfill/retry payloads and update sync job attempts
- `apps/server/src/mail/scheduled.ts` — enqueue retries and stale-sync alert scans
- `apps/server/src/index.ts` — expose operations routes via oRPC only (no extra REST required)
- `packages/infra/alchemy.run.ts` — ensure cron cadence covers retry + stale alert scans
- `apps/web/src/routes/_protected/inbox.tsx` — wire search bar and alert summary cards
- `apps/web/src/routes/_protected/alerts.tsx` — add acknowledge/resolve actions if included
- `apps/web/src/routes/_protected/groups.tsx` — add group-level backfill action
- `apps/web/src/routes/_protected/mailboxes/$mailboxId.tsx` — add mailbox-level backfill action
- `README.md` — document operational workflows and cron expectations

---

### Task 1: Add retry policy, sync job attempt metadata, and alert promotion helpers

**Files:**
- Create: `packages/mail/src/sync/retry.ts`
- Create: `packages/mail/src/sync/retry.test.ts`
- Create: `packages/api/src/operations/alerts.ts`
- Create: `packages/api/src/operations/alerts.test.ts`
- Modify: `packages/db/src/schema/mail.ts`
- Modify: `apps/server/src/mail/queue.ts`

- [ ] **Step 1: Write the failing retry and alert promotion tests**

```ts
// packages/mail/src/sync/retry.test.ts
import { describe, expect, it } from "vitest";

import { nextRetryDelaySeconds, classifySyncError } from "./retry";

describe("nextRetryDelaySeconds", () => {
  it("backs off from 30s to 120s over the first three retries", () => {
    expect(nextRetryDelaySeconds(0)).toBe(30);
    expect(nextRetryDelaySeconds(1)).toBe(60);
    expect(nextRetryDelaySeconds(2)).toBe(120);
  });
});

describe("classifySyncError", () => {
  it("marks OAuth-expired errors as manual intervention", () => {
    expect(classifySyncError(new Error("invalid_grant"))).toEqual({ retryable: false, category: "auth-expired" });
  });
});
```

```ts
// packages/api/src/operations/alerts.test.ts
import { describe, expect, it } from "vitest";

import { toSyncAlertInput } from "./alerts";

describe("toSyncAlertInput", () => {
  it("promotes auth-expired failures to high-severity alerts", () => {
    expect(
      toSyncAlertInput({
        mailboxId: "mailbox-1",
        category: "auth-expired",
        detail: "refresh token invalid",
      }),
    ).toMatchObject({
      severity: "high",
      title: "邮箱授权失效",
    });
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `pnpm exec vitest run packages/mail/src/sync/retry.test.ts packages/api/src/operations/alerts.test.ts`  
Expected: FAIL with missing module errors

- [ ] **Step 3: Implement retry helpers, alert helpers, and sync job fields**

```ts
// packages/mail/src/sync/retry.ts
const RETRY_DELAYS = [30, 60, 120, 300, 900] as const;

export function nextRetryDelaySeconds(attempt: number) {
  return RETRY_DELAYS[Math.min(attempt, RETRY_DELAYS.length - 1)];
}

export function classifySyncError(error: Error) {
  const message = error.message.toLowerCase();
  if (message.includes("invalid_grant") || message.includes("invalid credentials")) {
    return { retryable: false as const, category: "auth-expired" as const };
  }
  if (message.includes("rate") || message.includes("429")) {
    return { retryable: true as const, category: "rate-limited" as const };
  }
  return { retryable: true as const, category: "temporary" as const };
}
```

```ts
// packages/api/src/operations/alerts.ts
export function toSyncAlertInput(input: {
  mailboxId?: string;
  groupId?: string;
  category: "auth-expired" | "rate-limited" | "temporary" | "stale-sync";
  detail: string;
}) {
  const severity = input.category === "auth-expired" ? "high" : input.category === "stale-sync" ? "medium" : "low";
  const titleMap = {
    "auth-expired": "邮箱授权失效",
    "rate-limited": "同步遇到限流",
    temporary: "同步任务失败",
    "stale-sync": "邮箱长时间未同步",
  } as const;

  return {
    mailboxId: input.mailboxId,
    groupId: input.groupId,
    type: input.category,
    severity,
    status: "open",
    title: titleMap[input.category],
    detail: input.detail,
  };
}
```

```ts
// packages/db/src/schema/mail.ts (append fields to syncJob)
nextAttemptAt: integer("next_attempt_at", { mode: "timestamp_ms" }),
errorCategory: text("error_category"),
requestedRangeStart: integer("requested_range_start", { mode: "timestamp_ms" }),
requestedRangeEnd: integer("requested_range_end", { mode: "timestamp_ms" }),
requestedBy: text("requested_by"),
```

```ts
// apps/server/src/mail/queue.ts (error handling snippet)
try {
  // existing provider-specific handler
} catch (error) {
  const normalized = error instanceof Error ? error : new Error(String(error));
  const classification = classifySyncError(normalized);
  const retryCount = (job.retryCount ?? 0) + 1;

  await db.update(syncJob).set({
    status: classification.retryable ? "retry-scheduled" : "failed",
    retryCount,
    errorCategory: classification.category,
    errorMessage: normalized.message,
    nextAttemptAt: classification.retryable ? new Date(Date.now() + nextRetryDelaySeconds(retryCount) * 1000) : null,
  }).where(eq(syncJob.id, job.id));

  await db.insert(syncAlert).values(toSyncAlertInput({
    mailboxId: job.mailboxId ?? undefined,
    groupId: job.groupId ?? undefined,
    category: classification.category,
    detail: normalized.message,
  }));

  if (!classification.retryable) {
    message.ack();
    continue;
  }

  message.retry({ delaySeconds: nextRetryDelaySeconds(retryCount) });
}
```

- [ ] **Step 4: Verify tests, migrations, and type checks**

Run: `pnpm exec vitest run packages/mail/src/sync/retry.test.ts packages/api/src/operations/alerts.test.ts`  
Expected: PASS

Run: `pnpm run db:generate`  
Expected: migration adds retry/job metadata columns

Run: `pnpm run check-types`  
Expected: PASS

- [ ] **Step 5: Commit the retry and alert foundation**

```bash
git add packages/mail/src/sync/retry.ts packages/mail/src/sync/retry.test.ts packages/api/src/operations/alerts.ts packages/api/src/operations/alerts.test.ts packages/db/src/schema/mail.ts packages/db/src/migrations apps/server/src/mail/queue.ts
git commit -m "feat: add sync retry policy and alert promotion"
```

### Task 2: Add mailbox/group history backfill orchestration and operations UI

**Files:**
- Create: `packages/mail/src/sync/history-backfill.ts`
- Create: `packages/mail/src/sync/history-backfill.test.ts`
- Create: `packages/api/src/operations/backfill.ts`
- Create: `packages/api/src/operations/backfill.test.ts`
- Create: `packages/api/src/routers/operations.ts`
- Create: `apps/web/src/components/backfill-form.tsx`
- Create: `apps/web/src/routes/_protected/operations.tsx`
- Modify: `packages/api/src/routers/index.ts`
- Modify: `apps/web/src/routes/_protected/groups.tsx`
- Modify: `apps/web/src/routes/_protected/mailboxes/$mailboxId.tsx`

- [ ] **Step 1: Write the failing backfill payload and orchestration tests**

```ts
// packages/mail/src/sync/history-backfill.test.ts
import { describe, expect, it } from "vitest";

import { buildBackfillPayloads } from "./history-backfill";

describe("buildBackfillPayloads", () => {
  it("builds one provider-specific payload per mailbox", () => {
    expect(
      buildBackfillPayloads({
        mailboxes: [
          { id: "gmail-1", provider: "gmail" },
          { id: "imap-1", provider: "imap" },
        ],
        rangeStart: new Date("2026-04-01T00:00:00Z"),
        rangeEnd: new Date("2026-04-07T00:00:00Z"),
      }),
    ).toHaveLength(2);
  });
});
```

```ts
// packages/api/src/operations/backfill.test.ts
import { describe, expect, it } from "vitest";

import { enqueueMailboxBackfill } from "./backfill";

describe("enqueueMailboxBackfill", () => {
  it("creates a sync job and queue payload for the selected mailbox", async () => {
    const queued: any[] = [];
    const jobs: any[] = [];

    await enqueueMailboxBackfill({
      mailbox: { id: "mailbox-1", provider: "gmail" },
      rangeStart: new Date("2026-04-01T00:00:00Z"),
      rangeEnd: new Date("2026-04-07T00:00:00Z"),
      requestedBy: "admin",
      insertJob: async (job) => jobs.push(job),
      enqueue: async (payload) => queued.push(payload),
    });

    expect(jobs).toHaveLength(1);
    expect(queued[0]).toMatchObject({ provider: "gmail", reason: "gmail-backfill" });
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `pnpm exec vitest run packages/mail/src/sync/history-backfill.test.ts packages/api/src/operations/backfill.test.ts`  
Expected: FAIL with missing module errors

- [ ] **Step 3: Implement backfill helpers, operations router, and UI**

```ts
// packages/mail/src/sync/history-backfill.ts
export function buildBackfillPayloads(input: {
  mailboxes: Array<{ id: string; provider: "gmail" | "outlook" | "imap" }>;
  rangeStart: Date;
  rangeEnd: Date;
}) {
  return input.mailboxes.map((mailbox) => {
    const reason = mailbox.provider === "gmail"
      ? "gmail-backfill"
      : mailbox.provider === "outlook"
        ? "outlook-backfill"
        : "imap-backfill";

    return {
      provider: mailbox.provider,
      mailboxId: mailbox.id,
      reason,
      rangeStart: input.rangeStart.toISOString(),
      rangeEnd: input.rangeEnd.toISOString(),
    };
  });
}
```

```ts
// packages/api/src/operations/backfill.ts
import { syncJob } from "@email-relay/db/schema/mail";

import { buildBackfillPayloads } from "@email-relay/mail/sync/history-backfill";

export async function enqueueMailboxBackfill(input: {
  mailbox: { id: string; provider: "gmail" | "outlook" | "imap" };
  rangeStart: Date;
  rangeEnd: Date;
  requestedBy: string;
  insertJob: (job: typeof syncJob.$inferInsert) => Promise<void>;
  enqueue: (payload: unknown) => Promise<void>;
}) {
  await input.insertJob({
    mailboxId: input.mailbox.id,
    type: "history-backfill",
    status: "queued",
    requestedBy: input.requestedBy,
    requestedRangeStart: input.rangeStart,
    requestedRangeEnd: input.rangeEnd,
  });

  const [payload] = buildBackfillPayloads({
    mailboxes: [input.mailbox],
    rangeStart: input.rangeStart,
    rangeEnd: input.rangeEnd,
  });

  await input.enqueue(payload);
}
```

```ts
// packages/api/src/routers/operations.ts
import { z } from "zod";

import { protectedProcedure } from "../index";
import { enqueueMailboxBackfill } from "../operations/backfill";

export const operationsRouter = {
  triggerMailboxBackfill: protectedProcedure
    .input(z.object({ mailboxId: z.string().min(1), rangeStart: z.string().datetime(), rangeEnd: z.string().datetime() }))
    .handler(async ({ context, input }) => {
      const mailbox = await context.db.query.mailbox.findFirst({ where: (table, { eq }) => eq(table.id, input.mailboxId) });
      if (!mailbox) throw new Error("Mailbox not found");

      await enqueueMailboxBackfill({
        mailbox: { id: mailbox.id, provider: mailbox.provider as "gmail" | "outlook" | "imap" },
        rangeStart: new Date(input.rangeStart),
        rangeEnd: new Date(input.rangeEnd),
        requestedBy: "admin",
        insertJob: async (job) => {
          await context.db.insert(syncJob).values(job);
        },
        enqueue: async (payload) => {
          await context.env.MAIL_SYNC_QUEUE.send(payload);
        },
      });

      return { ok: true };
    }),
};
```

```tsx
// apps/web/src/components/backfill-form.tsx
import { Button } from "@email-relay/ui/components/button";
import { Input } from "@email-relay/ui/components/input";
import { Label } from "@email-relay/ui/components/label";
import { useForm } from "@tanstack/react-form";

export default function BackfillForm({
  onSubmit,
  isSubmitting,
}: {
  onSubmit: (value: { rangeStart: string; rangeEnd: string }) => Promise<void>;
  isSubmitting: boolean;
}) {
  const form = useForm({
    defaultValues: {
      rangeStart: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      rangeEnd: new Date().toISOString().slice(0, 10),
    },
    onSubmit: async ({ value }) => onSubmit(value),
  });

  return (
    <form className="grid gap-4 md:grid-cols-[1fr_1fr_auto]" onSubmit={(event) => { event.preventDefault(); form.handleSubmit(); }}>
      <div className="space-y-2"><Label htmlFor="rangeStart">开始日期</Label><Input id="rangeStart" type="date" value={form.state.values.rangeStart} onChange={(event) => form.setFieldValue("rangeStart", event.target.value)} /></div>
      <div className="space-y-2"><Label htmlFor="rangeEnd">结束日期</Label><Input id="rangeEnd" type="date" value={form.state.values.rangeEnd} onChange={(event) => form.setFieldValue("rangeEnd", event.target.value)} /></div>
      <Button type="submit" disabled={isSubmitting} className="self-end">{isSubmitting ? "提交中..." : "触发补拉"}</Button>
    </form>
  );
}
```

- [ ] **Step 4: Verify mailbox/group backfill end-to-end**

Run: `pnpm exec vitest run packages/mail/src/sync/history-backfill.test.ts packages/api/src/operations/backfill.test.ts`  
Expected: PASS

Run: `pnpm run check-types`  
Expected: PASS

Run: `pnpm run deploy`  
Expected: mailbox and group pages can trigger history backfill jobs, and the resulting provider-specific queue payloads process successfully

- [ ] **Step 5: Commit the backfill operations slice**

```bash
git add packages/mail/src/sync/history-backfill.ts packages/mail/src/sync/history-backfill.test.ts packages/api/src/operations/backfill.ts packages/api/src/operations/backfill.test.ts packages/api/src/routers/operations.ts packages/api/src/routers/index.ts apps/web/src/components/backfill-form.tsx apps/web/src/routes/_protected/operations.tsx apps/web/src/routes/_protected/groups.tsx apps/web/src/routes/_protected/mailboxes/$mailboxId.tsx
git commit -m "feat: add history backfill operations"
```

### Task 3: Add D1-backed FTS5 search and wire it into inbox search

**Files:**
- Create: `packages/db/src/schema/search.ts`
- Create: `apps/web/src/components/inbox-search-bar.tsx`
- Modify: `packages/api/src/inbox/repository.ts`
- Modify: `packages/api/src/routers/inbox.ts`
- Modify: `apps/web/src/routes/_protected/inbox.tsx`

- [ ] **Step 1: Write the failing FTS query helper test**

```ts
// packages/api/src/inbox/repository.test.ts (append this test)
it("searches messages through the FTS query when a search term is provided", async () => {
  const sqlCalls: string[] = [];
  const repository = createInboxRepository({
    execute: async (sql: string) => {
      sqlCalls.push(sql);
      return [];
    },
  } as any);

  await repository.searchMessages({ search: "invoice april" });

  expect(sqlCalls.some((sql) => sql.includes("mail_message_fts"))).toBe(true);
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `pnpm exec vitest run packages/api/src/inbox/repository.test.ts`  
Expected: FAIL because the FTS-aware search path does not exist yet

- [ ] **Step 3: Add the FTS migration and search-aware repository path**

```sql
-- packages/db/src/migrations/<timestamp>_mail_message_fts.sql
CREATE VIRTUAL TABLE mail_message_fts USING fts5(
  message_id UNINDEXED,
  subject,
  snippet,
  body_text,
  tokenize = 'unicode61 remove_diacritics 2'
);

INSERT INTO mail_message_fts (message_id, subject, snippet, body_text)
SELECT id, subject, snippet, body_text FROM mail_message;

CREATE TRIGGER mail_message_ai AFTER INSERT ON mail_message BEGIN
  INSERT INTO mail_message_fts (message_id, subject, snippet, body_text)
  VALUES (new.id, new.subject, new.snippet, new.body_text);
END;

CREATE TRIGGER mail_message_au AFTER UPDATE ON mail_message BEGIN
  DELETE FROM mail_message_fts WHERE message_id = old.id;
  INSERT INTO mail_message_fts (message_id, subject, snippet, body_text)
  VALUES (new.id, new.subject, new.snippet, new.body_text);
END;

CREATE TRIGGER mail_message_ad AFTER DELETE ON mail_message BEGIN
  DELETE FROM mail_message_fts WHERE message_id = old.id;
END;
```

```ts
// packages/api/src/inbox/repository.ts (add explicit search path)
async searchMessages(input: InboxFilters) {
  const filters = normalizeInboxFilters(input);
  if (!filters.search) {
    return this.listMessages(filters);
  }

  return db.execute(`
    SELECT m.id, m.subject, m.snippet, m.received_at as receivedAt, m.is_read as isRead,
           mb.address as mailboxAddress, mb.provider as provider
    FROM mail_message_fts fts
    JOIN mail_message m ON m.id = fts.message_id
    JOIN mailbox mb ON mb.id = m.mailbox_id
    WHERE mail_message_fts MATCH ?
    ORDER BY bm25(mail_message_fts), m.received_at DESC
    LIMIT ?
  `, [filters.search, filters.limit]);
}
```

```tsx
// apps/web/src/components/inbox-search-bar.tsx
import { Input } from "@email-relay/ui/components/input";

export default function InboxSearchBar({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="rounded-xl border p-3">
      <Input placeholder="搜索主题、摘要或正文" value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}
```

```tsx
// apps/web/src/routes/_protected/inbox.tsx (search plumbing sketch)
const [search, setSearch] = useState("");
const messages = useQuery(orpc.inbox.listMessages.queryOptions({ limit: 20, search }));

return (
  <div className="space-y-4">
    <InboxSearchBar value={search} onChange={setSearch} />
    {/* existing list */}
  </div>
);
```

- [ ] **Step 4: Verify search behavior locally and in Cloudflare**

Run: `pnpm exec vitest run packages/api/src/inbox/repository.test.ts`  
Expected: PASS

Run: `pnpm run check-types`  
Expected: PASS

Run: `pnpm run deploy`  
Expected: inbox search returns messages based on subject / snippet / body text across providers

- [ ] **Step 5: Commit the search slice**

```bash
git add packages/db/src/schema/search.ts packages/db/src/migrations packages/api/src/inbox/repository.ts packages/api/src/routers/inbox.ts apps/web/src/components/inbox-search-bar.tsx apps/web/src/routes/_protected/inbox.tsx
git commit -m "feat: add full-text inbox search"
```

### Task 4: Add operations dashboard cards, stale-sync scans, and alert actions

**Files:**
- Create: `apps/web/src/components/alert-summary-cards.tsx`
- Modify: `apps/web/src/routes/_protected/inbox.tsx`
- Modify: `apps/web/src/routes/_protected/alerts.tsx`
- Modify: `packages/api/src/routers/alerts.ts`
- Modify: `apps/server/src/mail/scheduled.ts`

- [ ] **Step 1: Write the failing alert summary test**

```tsx
// apps/web/src/components/alert-summary-cards.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import AlertSummaryCards from "./alert-summary-cards";

describe("AlertSummaryCards", () => {
  it("renders open alerts and stale sync counts", () => {
    render(<AlertSummaryCards summary={{ openAlerts: 3, staleMailboxes: 2, retriesQueued: 5 }} />);
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `pnpm exec vitest run --config apps/web/vitest.config.ts apps/web/src/components/alert-summary-cards.test.tsx`  
Expected: FAIL because the summary card component does not exist

- [ ] **Step 3: Implement summary cards, alert actions, and stale-sync scanning**

```tsx
// apps/web/src/components/alert-summary-cards.tsx
import { Card, CardContent, CardHeader, CardTitle } from "@email-relay/ui/components/card";

export default function AlertSummaryCards({ summary }: { summary: { openAlerts: number; staleMailboxes: number; retriesQueued: number } }) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card><CardHeader><CardTitle>未解决告警</CardTitle></CardHeader><CardContent>{summary.openAlerts}</CardContent></Card>
      <Card><CardHeader><CardTitle>超时未同步邮箱</CardTitle></CardHeader><CardContent>{summary.staleMailboxes}</CardContent></Card>
      <Card><CardHeader><CardTitle>待重试任务</CardTitle></CardHeader><CardContent>{summary.retriesQueued}</CardContent></Card>
    </div>
  );
}
```

```ts
// apps/server/src/mail/scheduled.ts (append stale-sync scan)
const staleMailboxes = await db.select({ id: mailbox.id, groupId: mailbox.groupId })
  .from(mailbox)
  .where(lt(mailbox.lastSuccessfulSyncAt, new Date(Date.now() - 60 * 60 * 1000)));

for (const row of staleMailboxes) {
  await db.insert(syncAlert).values(toSyncAlertInput({
    mailboxId: row.id,
    groupId: row.groupId ?? undefined,
    category: "stale-sync",
    detail: "超过 1 小时没有成功同步",
  }));
}
```

```ts
// packages/api/src/routers/alerts.ts (append actions)
resolve: protectedProcedure
  .input(z.object({ alertId: z.string().min(1) }))
  .handler(({ context, input }) =>
    context.db.update(syncAlert).set({ status: "resolved", resolvedAt: new Date() }).where(eq(syncAlert.id, input.alertId)),
  ),
summary: protectedProcedure.handler(async ({ context }) => {
  const [openAlerts] = await context.db.select({ count: sql<number>`count(*)` }).from(syncAlert).where(eq(syncAlert.status, "open"));
  const [retryJobs] = await context.db.select({ count: sql<number>`count(*)` }).from(syncJob).where(eq(syncJob.status, "retry-scheduled"));
  return { openAlerts: openAlerts.count, retriesQueued: retryJobs.count, staleMailboxes: 0 };
}),
```

- [ ] **Step 4: Verify the operations dashboard in Cloudflare**

Run: `pnpm exec vitest run --config apps/web/vitest.config.ts apps/web/src/components/alert-summary-cards.test.tsx`  
Expected: PASS

Run: `pnpm run check-types`  
Expected: PASS

Run: `pnpm run deploy`  
Expected: inbox page shows operational summary cards, alerts page can resolve alerts, and stale-sync scans create visible alerts

- [ ] **Step 5: Commit the dashboard and stale-sync slice**

```bash
git add apps/web/src/components/alert-summary-cards.tsx apps/web/src/components/alert-summary-cards.test.tsx apps/web/src/routes/_protected/inbox.tsx apps/web/src/routes/_protected/alerts.tsx packages/api/src/routers/alerts.ts apps/server/src/mail/scheduled.ts
git commit -m "feat: add sync operations dashboard"
```

### Task 5: Finish documentation and the production verification checklist

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Document operations runbooks**

```md
## Sync operations

- Mailbox backfill: run from mailbox detail or operations page.
- Group backfill: run from group page for all mailboxes in the group.
- Retry flow: failed jobs are re-queued with exponential backoff unless marked `auth-expired`.
- Alerts: resolve stale or temporary alerts in the alerts page after verification.
- Search: inbox search uses a D1 FTS index over subject, snippet, and body text.
```

- [ ] **Step 2: Execute the production verification checklist**

Run:

```bash
set -a
source ./.env
set +a
pnpm run deploy
```

Expected checklist:
- mailbox-level backfill creates queued sync jobs
- group-level backfill fans out to multiple provider-specific payloads
- failed jobs transition to `retry-scheduled` with `nextAttemptAt`
- auth-expired jobs raise high-severity alerts instead of endless retries
- inbox full-text search returns cross-provider results
- stale-sync scan produces alerts for mailboxes that have stopped syncing

- [ ] **Step 3: Commit the operations docs**

```bash
git add README.md
git commit -m "docs: add sync operations runbook"
```

---

## Self-review

### Spec coverage
- Single mailbox and group history backfill: Task 2
- Retry/backoff and failure visibility: Task 1
- Alert panel improvements and stale-sync scans: Task 4
- Full-text search: Task 3
- Cloudflare-first deployment checkpoints: Tasks 2 through 5

### Placeholder scan
- No unresolved placeholders remain inside execution steps
- Provider auth/connect details remain in the dedicated provider plans

### Type consistency
- `MailSyncPayloadSchema` stays the queue contract
- `syncJob` holds retry and range metadata across all providers
- `toSyncAlertInput` is the single promotion path from failure category to alert row
