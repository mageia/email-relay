import { describe, expect, it } from "vitest";

import { classifySyncError, nextRetryDelaySeconds } from "./retry";

describe("nextRetryDelaySeconds", () => {
  it("backs off from 30s to 120s over the first three retries", () => {
    expect(nextRetryDelaySeconds(0)).toBe(30);
    expect(nextRetryDelaySeconds(1)).toBe(60);
    expect(nextRetryDelaySeconds(2)).toBe(120);
  });
});

describe("classifySyncError", () => {
  it("marks OAuth-expired errors as manual intervention", () => {
    expect(classifySyncError(new Error("invalid_grant"))).toEqual({
      retryable: false,
      category: "auth-expired",
    });
  });
});
