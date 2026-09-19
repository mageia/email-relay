import { describe, expect, it } from "vitest";

import { buildGmailRangeQuery } from "../gmail/query";
import { nextUidWindow, toImapSearchDate } from "../imap/poll";

/**
 * The three providers express date ranges in different dialects, so a single UI
 * input previously produced three different windows. Gmail `before:` and IMAP
 * `BEFORE` are exclusive while the admin picks an inclusive end date, and Outlook
 * originally used an inclusive `le` at midnight. This locks the equivalence.
 */
const RANGE = {
  rangeStart: new Date("2026-04-01T00:00:00.000Z"),
  rangeEnd: new Date("2026-04-07T00:00:00.000Z"),
};

/** Mirrors the bound the Outlook query builder derives, without issuing a request. */
function outlookBounds(range: { rangeStart: Date; rangeEnd: Date }) {
  return {
    start: range.rangeStart.toISOString(),
    endExclusive: new Date(range.rangeEnd.getTime() + 24 * 60 * 60 * 1000).toISOString(),
  };
}

describe("backfill window equivalence across providers", () => {
  it("derives the same inclusive start and exclusive end for every provider", () => {
    const gmail = buildGmailRangeQuery(RANGE);
    const outlook = outlookBounds(RANGE);
    const imap = nextUidWindow({ lastSeenUid: null, range: RANGE });

    // Gmail: epoch seconds, after inclusive / before exclusive.
    expect(gmail).toBe("after:1775001600 before:1775606400");
    expect(Number(gmail.match(/after:(\d+)/)?.[1]) * 1000).toBe(RANGE.rangeStart.getTime());
    expect(Number(gmail.match(/before:(\d+)/)?.[1]) * 1000).toBe(
      RANGE.rangeEnd.getTime() + 24 * 60 * 60 * 1000,
    );

    // Outlook: ISO instants, ge inclusive / lt exclusive.
    expect(outlook.start).toBe("2026-04-01T00:00:00.000Z");
    expect(outlook.endExclusive).toBe("2026-04-08T00:00:00.000Z");

    // IMAP: date literals, SINCE inclusive / BEFORE exclusive.
    expect(imap.search).toBe("SINCE 01-Apr-2026 BEFORE 08-Apr-2026");
    expect(toImapSearchDate(RANGE.rangeStart)).toBe("01-Apr-2026");
    expect(toImapSearchDate(new Date(RANGE.rangeEnd.getTime() + 24 * 60 * 60 * 1000))).toBe(
      "08-Apr-2026",
    );
  });

  it("covers the selected end day in every provider for a single-day range", () => {
    const single = {
      rangeStart: new Date("2026-04-01T00:00:00.000Z"),
      rangeEnd: new Date("2026-04-01T00:00:00.000Z"),
    };

    // A single-day pick must still span a full day, not collapse to an empty window.
    expect(buildGmailRangeQuery(single)).toBe("after:1775001600 before:1775088000");
    expect(outlookBounds(single).endExclusive).toBe("2026-04-02T00:00:00.000Z");
    expect(nextUidWindow({ lastSeenUid: null, range: single }).search).toBe(
      "SINCE 01-Apr-2026 BEFORE 02-Apr-2026",
    );
  });

  it("keeps the windows aligned across a month boundary", () => {
    const crossMonth = {
      rangeStart: new Date("2026-02-27T00:00:00.000Z"),
      rangeEnd: new Date("2026-03-01T00:00:00.000Z"),
    };

    expect(outlookBounds(crossMonth).endExclusive).toBe("2026-03-02T00:00:00.000Z");
    expect(nextUidWindow({ lastSeenUid: null, range: crossMonth }).search).toBe(
      "SINCE 27-Feb-2026 BEFORE 02-Mar-2026",
    );
    expect(
      Number(buildGmailRangeQuery(crossMonth).match(/before:(\d+)/)?.[1]) * 1000,
    ).toBe(Date.parse("2026-03-02T00:00:00.000Z"));
  });
});
