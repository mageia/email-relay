import type { InboxFilters } from "./types";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export function normalizeInboxFilters(
  input: InboxFilters,
): Required<Pick<InboxFilters, "limit">> & InboxFilters {
  const search = input.search?.trim() || undefined;

  return {
    search,
    provider: input.provider || undefined,
    groupId: input.groupId || undefined,
    mailboxId: input.mailboxId || undefined,
    limit: input.limit && input.limit > 0 ? Math.min(input.limit, MAX_LIMIT) : DEFAULT_LIMIT,
  };
}
