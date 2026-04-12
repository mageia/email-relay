import { describe, expect, it } from "vitest";

import { normalizeInboxFilters } from "./filter";

describe("normalizeInboxFilters", () => {
  it("trims search and defaults to descending receivedAt order", () => {
    expect(normalizeInboxFilters({ search: "  invoice  " })).toEqual({
      search: "invoice",
      provider: undefined,
      groupId: undefined,
      mailboxId: undefined,
      limit: 20,
    });
  });
});
