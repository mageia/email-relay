import { hasExhaustedRetries, nextRetryDelaySeconds } from "./retry";

export type SyncJobStatus = "queued" | "processing" | "retry-scheduled" | "completed" | "failed";

export type SyncJobPatch = {
  status: SyncJobStatus;
  startedAt?: Date | null;
  finishedAt?: Date | null;
  nextAttemptAt?: Date | null;
  retryCount?: number;
  errorCategory?: string;
  errorMessage?: string;
};

/**
 * State transition for a sync job that finished a unit of work successfully.
 *
 * When a page enqueued a continuation the job must be released back to `queued`
 * rather than left `processing`: only `queued` and `retry-scheduled` rows can be
 * claimed, so a `processing` row could neither be claimed by the next page nor
 * record a failure against it, and would never reach a terminal state.
 */
export function nextStateAfterSuccess(input: { hasPendingPage: boolean; now?: Date }): SyncJobPatch {
  const now = input.now ?? new Date();

  if (input.hasPendingPage) {
    return {
      status: "queued",
      startedAt: null,
      nextAttemptAt: null,
      // A completed page is real progress, so the retry budget resets. Otherwise
      // attempts accumulate across pages and a long backfill would abandon itself
      // after five failures spread over unrelated pages.
      retryCount: 0,
    };
  }

  return {
    status: "completed",
    finishedAt: now,
    nextAttemptAt: null,
  };
}

/**
 * State transition for a failed attempt, plus whether the queue should redeliver.
 *
 * `attemptCount` is 1-based and counts the attempt that just failed.
 */
export function nextStateAfterFailure(input: {
  attemptCount: number;
  retryable: boolean;
  category: string;
  message: string;
  now?: Date;
}): { patch: SyncJobPatch; retry: boolean; delaySeconds: number; exhausted: boolean } {
  const now = input.now ?? new Date();
  const exhausted = hasExhaustedRetries(input.attemptCount);
  const retry = input.retryable && !exhausted;
  // attemptCount is 1-based; the backoff table is 0-indexed.
  const delaySeconds = nextRetryDelaySeconds(input.attemptCount - 1);

  return {
    retry,
    delaySeconds,
    exhausted,
    patch: {
      status: retry ? "retry-scheduled" : "failed",
      retryCount: input.attemptCount,
      errorCategory: input.category,
      errorMessage: input.message,
      nextAttemptAt: retry ? new Date(now.getTime() + delaySeconds * 1000) : null,
      finishedAt: retry ? null : now,
    },
  };
}
