export function nextUidWindow(input: { lastSeenUid: number | null }) {
  return {
    search: input.lastSeenUid ? `UID ${input.lastSeenUid + 1}:*` : "ALL",
  };
}
