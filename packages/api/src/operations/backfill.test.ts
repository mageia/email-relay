import { describe, expect, it } from "vitest";

import { enqueueMailboxBackfill, requeueHistoryBackfillJob } from "./backfill";

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

describe("requeueHistoryBackfillJob", () => {
  it("rebuilds the payload for a retry-scheduled history backfill job and marks it queued", async () => {
    const queued: any[] = [];
    const updates: any[] = [];

    await requeueHistoryBackfillJob({
      job: {
        id: "job-1",
        mailboxId: "mailbox-1",
        type: "history-backfill",
        requestedRangeStart: new Date("2026-04-01T00:00:00Z"),
        requestedRangeEnd: new Date("2026-04-07T00:00:00Z"),
      },
      mailbox: { id: "mailbox-1", provider: "outlook" },
      updateJob: async (jobId, patch) => updates.push({ jobId, patch }),
      enqueue: async (payload) => queued.push(payload),
    });

    expect(queued).toEqual([
      expect.objectContaining({
        provider: "outlook",
        mailboxId: "mailbox-1",
        reason: "outlook-backfill",
      }),
    ]);
    expect(updates).toEqual([
      {
        jobId: "job-1",
        patch: {
          nextAttemptAt: null,
          startedAt: null,
          status: "queued",
        },
      },
    ]);
  });
});
