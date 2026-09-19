import { describe, expect, it } from "vitest";

import { buildGmailRangeQuery } from "./query";

describe("buildGmailRangeQuery", () => {
  // `before:` is exclusive, so the end bound is advanced one day to keep the
  // selected end date inside the window. This matches the IMAP SINCE/BEFORE and
  // Outlook `lt` handling, so the same UI input yields the same window everywhere.
  it("includes the selected end date by advancing the exclusive bound", () => {
    expect(
      buildGmailRangeQuery({
        rangeStart: new Date("2026-04-01T00:00:00.000Z"),
        rangeEnd: new Date("2026-04-07T00:00:00.000Z"),
      }),
    ).toBe("after:1775001600 before:1775606400");
  });

  it("keeps the bounds aligned to whole seconds", () => {
    expect(
      buildGmailRangeQuery({
        rangeStart: new Date("2026-04-01T00:00:00.500Z"),
        rangeEnd: new Date("2026-04-07T00:00:00.500Z"),
      }),
    ).toBe("after:1775001600 before:1775606401");
  });

  it("covers a single-day window", () => {
    expect(
      buildGmailRangeQuery({
        rangeStart: new Date("2026-04-01T00:00:00.000Z"),
        rangeEnd: new Date("2026-04-01T00:00:00.000Z"),
      }),
    ).toBe("after:1775001600 before:1775088000");
  });
});
