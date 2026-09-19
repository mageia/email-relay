const RETRY_DELAYS = [30, 60, 120, 300, 900] as const;

/**
 * Maximum number of failed attempts before a sync job stops being rescheduled.
 * Matches the retry budget documented in README.
 */
export const MAX_SYNC_ATTEMPTS = 5;

/** Zero-based index into the backoff table; callers pass `attemptCount - 1`. */
export function nextRetryDelaySeconds(attempt: number): number {
  const cappedAttempt = Math.max(0, Math.min(attempt, RETRY_DELAYS.length - 1));
  const delay = RETRY_DELAYS[cappedAttempt];

  if (delay === undefined) {
    throw new Error(`Missing retry delay for attempt ${attempt}`);
  }

  return delay;
}

/**
 * How long past `nextAttemptAt` a job must sit before cron treats it as stuck and
 * requeues it.
 *
 * In-flight failures are retried by the queue itself. Cron is only a recovery net
 * for jobs whose message was lost, so the grace period must exceed the longest
 * backoff or cron would double-queue every ordinary retry.
 */
export const STUCK_JOB_GRACE_SECONDS = 30 * 60;

/** True once a job has burned its whole retry budget and should be failed permanently. */
export function hasExhaustedRetries(attempt: number): boolean {
  return attempt >= MAX_SYNC_ATTEMPTS;
}

const AUTH_PATTERNS = [
  "invalid_grant",
  "invalid credentials",
  "invalid_client",
  "unauthorized",
  "authenticationfailed",
  "token has expired",
  "401",
];

/**
 * Rate-limit detection is intentionally phrase-based. A bare `includes("rate")`
 * matches unrelated words such as "generate" or "corporate" and misclassifies
 * ordinary failures as throttling.
 */
const RATE_LIMIT_PATTERNS = [
  "rate limit",
  "rate-limit",
  "ratelimit",
  "rate_limit",
  "too many requests",
  "quota exceeded",
  "quotaexceeded",
  "429",
];

export function classifySyncError(error: Error) {
  const message = error.message.toLowerCase();

  if (AUTH_PATTERNS.some((pattern) => message.includes(pattern))) {
    return {
      retryable: false as const,
      category: "auth-expired" as const,
    };
  }

  if (RATE_LIMIT_PATTERNS.some((pattern) => message.includes(pattern))) {
    return {
      retryable: true as const,
      category: "rate-limited" as const,
    };
  }

  return {
    retryable: true as const,
    category: "temporary" as const,
  };
}
