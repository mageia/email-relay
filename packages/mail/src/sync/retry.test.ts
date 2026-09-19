import { describe, expect, it } from "vitest";

import {
  classifySyncError,
  hasExhaustedRetries,
  MAX_SYNC_ATTEMPTS,
  nextRetryDelaySeconds,
} from "./retry";

describe("nextRetryDelaySeconds", () => {
  it("backs off from 30s to 120s over the first three retries", () => {
    expect(nextRetryDelaySeconds(0)).toBe(30);
    expect(nextRetryDelaySeconds(1)).toBe(60);
    expect(nextRetryDelaySeconds(2)).toBe(120);
  });

  it("saturates at the longest delay", () => {
    expect(nextRetryDelaySeconds(4)).toBe(900);
    expect(nextRetryDelaySeconds(99)).toBe(900);
  });
});

describe("hasExhaustedRetries", () => {
  // Regression: nothing enforced a retry ceiling, so a permanently failing job was
  // rescheduled every 15 minutes indefinitely despite README promising five tries.
  it("allows attempts below the budget and stops at the budget", () => {
    expect(hasExhaustedRetries(MAX_SYNC_ATTEMPTS - 1)).toBe(false);
    expect(hasExhaustedRetries(MAX_SYNC_ATTEMPTS)).toBe(true);
    expect(hasExhaustedRetries(MAX_SYNC_ATTEMPTS + 1)).toBe(true);
  });

  it("caps the budget at five attempts to match documented behaviour", () => {
    expect(MAX_SYNC_ATTEMPTS).toBe(5);
  });
});

describe("classifySyncError", () => {
  it("marks OAuth-expired errors as manual intervention", () => {
    expect(classifySyncError(new Error("invalid_grant"))).toEqual({
      retryable: false,
      category: "auth-expired",
    });
  });

  it.each([
    "Gmail list failed: 429",
    "Rate limit exceeded for quota metric",
    "Too many requests",
    "quotaExceeded",
  ])("classifies %s as rate-limited", (message) => {
    expect(classifySyncError(new Error(message))).toEqual({
      retryable: true,
      category: "rate-limited",
    });
  });

  // Regression: a bare includes("rate") matched ordinary words and mislabelled
  // unrelated failures as throttling.
  it.each([
    "Failed to generate message body",
    "Corporate proxy refused the connection",
    "Could not separate multipart payload",
  ])("does not treat %s as rate limiting", (message) => {
    expect(classifySyncError(new Error(message))).toEqual({
      retryable: true,
      category: "temporary",
    });
  });

  it("treats unknown failures as temporary and retryable", () => {
    expect(classifySyncError(new Error("socket hang up"))).toEqual({
      retryable: true,
      category: "temporary",
    });
  });
});
