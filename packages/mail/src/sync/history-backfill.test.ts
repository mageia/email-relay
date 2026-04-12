import { describe, expect, it } from "vitest";

import { buildBackfillPayloads } from "./history-backfill";

describe("buildBackfillPayloads", () => {
  it("builds one provider-specific payload per mailbox", () => {
    expect(
      buildBackfillPayloads({
        mailboxes: [
          { id: "gmail-1", provider: "gmail" },
          { id: "imap-1", provider: "imap" },
        ],
        rangeStart: new Date("2026-04-01T00:00:00Z"),
        rangeEnd: new Date("2026-04-07T00:00:00Z"),
      }),
    ).toHaveLength(2);
  });
});
