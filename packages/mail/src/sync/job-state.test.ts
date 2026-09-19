import { describe, expect, it } from "vitest";

import { nextStateAfterFailure, nextStateAfterSuccess } from "./job-state";

const NOW = new Date("2026-04-12T12:00:00.000Z");

describe("nextStateAfterSuccess", () => {
  it("completes the job when no further pages are pending", () => {
    expect(nextStateAfterSuccess({ hasPendingPage: false, now: NOW })).toEqual({
      status: "completed",
      finishedAt: NOW,
      nextAttemptAt: null,
    });
  });

  /**
   * Regression: a paging job was left in "processing". Only "queued" and
   * "retry-scheduled" rows can be claimed, so the next page could neither claim the
   * job nor record a failure against it, and it never reached a terminal state.
   */
  it("releases the job back to queued when a continuation was enqueued", () => {
    const patch = nextStateAfterSuccess({ hasPendingPage: true, now: NOW });

    expect(patch.status).toBe("queued");
    expect(patch.startedAt).toBeNull();
    // Crucially not "completed": the range is not fully synced yet.
    expect(patch.status).not.toBe("completed");
    expect(patch.status).not.toBe("processing");
  });

  it("resets the retry budget after a page succeeds", () => {
    // Without this, attempts accumulate across pages: a page that failed four
    // times then succeeded would leave the next page one failure from being
    // abandoned, even though the backfill is making progress.
    expect(nextStateAfterSuccess({ hasPendingPage: true, now: NOW }).retryCount).toBe(0);
  });

  it("keeps a released job claimable by the statuses claimSyncJob looks for", () => {
    const claimable = new Set(["queued", "retry-scheduled"]);

    expect(claimable.has(nextStateAfterSuccess({ hasPendingPage: true }).status)).toBe(true);
  });
});

describe("nextStateAfterFailure", () => {
  it("schedules a retry with the documented backoff sequence", () => {
    const delays = [1, 2, 3, 4].map(
      (attemptCount) =>
        nextStateAfterFailure({
          attemptCount,
          retryable: true,
          category: "temporary",
          message: "socket hang up",
          now: NOW,
        }).delaySeconds,
    );

    // Regression: the first attempt previously indexed position 1 and skipped 30s.
    expect(delays).toEqual([30, 60, 120, 300]);
  });

  it("records the retry schedule on the job", () => {
    const { patch } = nextStateAfterFailure({
      attemptCount: 1,
      retryable: true,
      category: "temporary",
      message: "socket hang up",
      now: NOW,
    });

    expect(patch).toEqual({
      status: "retry-scheduled",
      retryCount: 1,
      errorCategory: "temporary",
      errorMessage: "socket hang up",
      nextAttemptAt: new Date(NOW.getTime() + 30 * 1000),
      finishedAt: null,
    });
  });

  it("fails immediately for a non-retryable error", () => {
    const result = nextStateAfterFailure({
      attemptCount: 1,
      retryable: false,
      category: "auth-expired",
      message: "invalid_grant",
      now: NOW,
    });

    expect(result.retry).toBe(false);
    expect(result.exhausted).toBe(false);
    expect(result.patch.status).toBe("failed");
    expect(result.patch.finishedAt).toEqual(NOW);
  });

  it("stops retrying once the budget is spent", () => {
    const result = nextStateAfterFailure({
      attemptCount: 5,
      retryable: true,
      category: "temporary",
      message: "socket hang up",
      now: NOW,
    });

    expect(result.retry).toBe(false);
    expect(result.exhausted).toBe(true);
    expect(result.patch.status).toBe("failed");
    expect(result.patch.nextAttemptAt).toBeNull();
  });
});
