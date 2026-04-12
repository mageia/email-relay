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
