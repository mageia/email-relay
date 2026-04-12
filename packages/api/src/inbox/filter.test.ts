import { describe, expect, it } from "vitest";

import { normalizeInboxFilters } from "./filter";

describe("normalizeInboxFilters", () => {
  it("trims search and defaults to descending receivedAt order", () => {
    expect(normalizeInboxFilters({ search: "  invoice  " })).toEqual({
      search: "invoice",
      provider: undefined,
      groupId: undefined,
      mailboxId: undefined,
      status: undefined,
      limit: 20,
    });
  });

  it("keeps the status filter when provided", () => {
    expect(normalizeInboxFilters({ status: "active", provider: "gmail" })).toEqual({
      search: undefined,
      provider: "gmail",
      groupId: undefined,
      mailboxId: undefined,
      status: "active",
      limit: 20,
    });
  });
});
