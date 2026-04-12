const RETRY_DELAYS = [30, 60, 120, 300, 900] as const;

export function nextRetryDelaySeconds(attempt: number) {
  return RETRY_DELAYS[Math.min(attempt, RETRY_DELAYS.length - 1)];
}

export function classifySyncError(error: Error) {
  const message = error.message.toLowerCase();
  if (message.includes("invalid_grant") || message.includes("invalid credentials")) {
    return {
      retryable: false as const,
      category: "auth-expired" as const,
    };
  }

  if (message.includes("rate") || message.includes("429")) {
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
