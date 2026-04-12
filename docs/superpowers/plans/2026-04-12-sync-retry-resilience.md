# Sync Retry & Scheduled Resilience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让队列在处理 history-backfill 等 `sync_job` 相关任务时统一捕获异常、更新元数据并在调度器里自动重投；同时把不能重试的失败晋升为 alert，提升可观测性。

**Architecture:** 雇用 Drizzle ORM 在 queue 端 claim/完成 `sync_job`、记录 retry metadata，并通过 cron-triggers 的 scheduled handler 扫描 `nextAttemptAt` 到期的 `history-backfill` job 来重建 payload 并重新送入 Cloudflare Queue。

**Tech Stack:** Cloudflare Workers Queue/Cron, Drizzle ORM + SQLite migrations, Vitest for existing retry/alert helpers, TypeScript in apps/server and packages/api layers.

---

### Task 1: Make `apps/server/src/mail/queue.ts` job-aware with classification and alerts

**Files:**
- Modify: `apps/server/src/mail/queue.ts`

- [ ] **Step 1: Pull in Drizzle helpers and add job-claim/complete helpers**

```ts
import { asc, eq, or } from "drizzle-orm";
import { MailSyncPayload } from "@email-relay/mail/sync/payload";
import { classifySyncError, nextRetryDelaySeconds } from "@email-relay/mail/sync/retry";
import { toSyncAlertInput } from "@email-relay/api/operations/alerts";
import { syncAlert, syncJob } from "@email-relay/db/schema/mail";

const SYNC_JOB_TYPE_FOR_REASON: Record<string, string | undefined> = {
  "gmail-backfill": "history-backfill",
  "outlook-backfill": "history-backfill",
  "imap-backfill": "history-backfill",
};

type SyncJobRow = ReturnType<typeof syncJob.$inferSelect>[number];

async function claimSyncJob(db, payload: MailSyncPayload) {
  const jobType = SYNC_JOB_TYPE_FOR_REASON[payload.reason];
  if (!jobType) {
    return null;
  }
  const [job] = await db
    .select()
    .from(syncJob)
    .where(
      eq(syncJob.mailboxId, payload.mailboxId),
      eq(syncJob.type, jobType),
      or(eq(syncJob.status, "queued"), eq(syncJob.status, "retry-scheduled")),
    )
    .orderBy(asc(syncJob.createdAt))
    .limit(1);
  if (!job) {
    return null;
  }
  await db
    .update(syncJob)
    .set({
      status: "processing",
      startedAt: new Date(),
      nextAttemptAt: null,
    })
    .where(eq(syncJob.id, job.id));
  return job;
}

async function finalizeSyncJobSuccess(db, job: SyncJobRow | null) {
  if (!job) {
    return;
  }
  await db
    .update(syncJob)
    .set({
      status: "completed",
      finishedAt: new Date(),
      nextAttemptAt: null,
    })
    .where(eq(syncJob.id, job.id));
}
```

- [ ] **Step 2: Structure the `for` loop so every message claims the job, uses try/catch, and calls a completion helper before acking**

```ts
for (const message of batch.messages) {
  const payload = MailSyncPayloadSchema.parse(message.body);
  const job = await claimSyncJob(db, payload);

  try {
    // provider-specific logic (imap/outlook/gmail) remains unchanged in each branch
    // but before every existing `message.ack()` we will call
    await finalizeSyncJobSuccess(db, job);
    await message.ack();
    continue;
  } catch (error) {
    // Step 3 will fill this catch block
  }
}
```

- [ ] **Step 3: In the catch block classify the error, update `sync_job` metadata, promote non-retryable alerts, ack the message, and continue**

```ts
  catch (rawError) {
    const error = rawError instanceof Error ? rawError : new Error(String(rawError));
    const classification = classifySyncError(error);
    if (job) {
      const retryCount = (job.retryCount ?? 0) + 1;
      await db.update(syncJob).set({
        status: classification.retryable ? "retry-scheduled" : "failed",
        retryCount,
        errorMessage: error.message,
        errorCategory: classification.category,
        nextAttemptAt: classification.retryable
          ? new Date(Date.now() + nextRetryDelaySeconds(retryCount) * 1000)
          : null,
        finishedAt: classification.retryable ? null : new Date(),
      }).where(eq(syncJob.id, job.id));
    }
    if (!classification.retryable) {
      await db.insert(syncAlert).values(
        toSyncAlertInput({
          mailboxId: job?.mailboxId ?? payload.mailboxId,
          groupId: job?.groupId ?? undefined,
          category: classification.category,
          detail: `${payload.provider} ${payload.reason} failed: ${error.message}`,
        }),
      );
    }

    await message.ack();
    continue;
  }
```

- [ ] **Step 4: Run the existing helper suites to confirm no regressions**

Run: `pnpm exec vitest run packages/mail/src/sync/retry.test.ts packages/api/src/operations/alerts.test.ts`
Expected: PASS

### Task 2: Re-enqueue due `retry-scheduled` jobs in `apps/server/src/mail/scheduled.ts`

**Files:**
- Modify: `apps/server/src/mail/scheduled.ts`

- [ ] **Step 1: Query `retry-scheduled` jobs whose `nextAttemptAt` is in the past and rebuild payloads with `buildBackfillPayloads`**

```ts
import { sql } from "drizzle-orm";
import { mailbox, syncJob } from "@email-relay/db/schema/mail";
import { buildBackfillPayloads } from "@email-relay/mail";

const queue = env.MAIL_SYNC_QUEUE as { send: (payload: unknown) => Promise<void> };
const retryJobs = await db
  .select()
  .from(syncJob)
  .where(
    eq(syncJob.status, "retry-scheduled"),
    sql`${syncJob.nextAttemptAt} <= ${Date.now()}`,
  );
for (const job of retryJobs) {
  if (job.type !== "history-backfill" || !job.mailboxId || !job.requestedRangeStart || !job.requestedRangeEnd) {
    continue;
  }
  const mailboxRow = (await db.select().from(mailbox).where(eq(mailbox.id, job.mailboxId)).limit(1))[0];
  if (!mailboxRow) {
    continue;
  }
  const [payload] = buildBackfillPayloads({
    mailboxes: [{ id: mailboxRow.id, provider: mailboxRow.provider as "gmail" | "outlook" | "imap" }],
    rangeStart: job.requestedRangeStart,
    rangeEnd: job.requestedRangeEnd,
  });
  await queue.send(payload);
```

- [ ] **Step 2: After sending, mark the job `queued` again and clear `nextAttemptAt` so the scheduled loop stops hitting it**

```ts
  await db
    .update(syncJob)
    .set({
      status: "queued",
      nextAttemptAt: null,
      startedAt: null,
    })
    .where(eq(syncJob.id, job.id));
}
```

- [ ] **Step 3: Run the type checker to ensure the new Drizzle usage stays sound with TypeScript**

Run: `pnpm run check-types`
Expected: PASS

Plan complete and saved to `docs/superpowers/plans/2026-04-12-sync-retry-resilience.md`. Inline execution preferred; I'll handle the steps in this session.
