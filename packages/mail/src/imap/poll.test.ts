import { describe, expect, it } from "vitest";

import { nextUidWindow, toImapSearchDate } from "./poll";

describe("nextUidWindow", () => {
  it("starts after the previously seen UID", () => {
    expect(nextUidWindow({ lastSeenUid: 100 })).toEqual({ search: "UID 101:*" });
  });

  it("searches everything when no cursor exists", () => {
    expect(nextUidWindow({ lastSeenUid: null })).toEqual({ search: "ALL" });
  });

  // Regression: a backfill reused the forward-only UID window, so the requested
  // date range was ignored and older mail was never reachable.
  it("uses a date window for a backfill instead of the UID cursor", () => {
    expect(
      nextUidWindow({
        lastSeenUid: 100,
        range: {
          rangeStart: new Date("2026-04-01T00:00:00.000Z"),
          rangeEnd: new Date("2026-04-07T00:00:00.000Z"),
        },
      }),
    ).toEqual({ search: "SINCE 01-Apr-2026 BEFORE 08-Apr-2026" });
  });

  it("falls back to the UID cursor when range is null", () => {
    expect(nextUidWindow({ lastSeenUid: 7, range: null })).toEqual({ search: "UID 8:*" });
  });
});

describe("toImapSearchDate", () => {
  it("formats dates as RFC 3501 DD-Mon-YYYY in UTC", () => {
    expect(toImapSearchDate(new Date("2026-01-09T00:00:00.000Z"))).toBe("09-Jan-2026");
    expect(toImapSearchDate(new Date("2026-12-31T23:59:59.000Z"))).toBe("31-Dec-2026");
  });
});
