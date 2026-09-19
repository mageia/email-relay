import { afterEach, describe, expect, it, vi } from "vitest";

import { getOutlookMessagesInRange } from "./delta";

afterEach(() => {
  vi.unstubAllGlobals();
});

function captureRequestUrl() {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown) => {
      calls.push(String(input));
      return new Response(JSON.stringify({ value: [] }), { status: 200 });
    }),
  );
  return calls;
}

/** Reads a query parameter, decoding URLSearchParams' `+` form of a space. */
function queryParam(rawUrl: string, name: string) {
  return new URL(rawUrl).searchParams.get(name);
}

describe("getOutlookMessagesInRange", () => {
  // Backfills cannot use the delta endpoint: delta only walks forward from a token
  // and offers no date filter, so the requested window would be ignored.
  it("filters on receivedDateTime and includes the selected end date", async () => {
    const calls = captureRequestUrl();

    await getOutlookMessagesInRange({
      accessToken: "token",
      rangeStart: new Date("2026-04-01T00:00:00.000Z"),
      rangeEnd: new Date("2026-04-07T00:00:00.000Z"),
    });

    // Exclusive upper bound one day later, so all of 2026-04-07 is covered.
    expect(queryParam(calls[0] ?? "", "$filter")).toBe(
      "receivedDateTime ge 2026-04-01T00:00:00.000Z and receivedDateTime lt 2026-04-08T00:00:00.000Z",
    );
  });

  it("orders by receivedDateTime so paging is deterministic", async () => {
    const calls = captureRequestUrl();

    await getOutlookMessagesInRange({
      accessToken: "token",
      rangeStart: new Date("2026-04-01T00:00:00.000Z"),
      rangeEnd: new Date("2026-04-07T00:00:00.000Z"),
    });

    // Graph requires the $orderby property to also appear in $filter, which it does.
    expect(queryParam(calls[0] ?? "", "$orderby")).toBe("receivedDateTime desc");
  });

  it("follows the server-provided nextLink verbatim", async () => {
    const calls = captureRequestUrl();
    const nextLink = "https://graph.microsoft.com/v1.0/me/messages?$skiptoken=abc";

    await getOutlookMessagesInRange({
      accessToken: "token",
      rangeStart: new Date("2026-04-01T00:00:00.000Z"),
      rangeEnd: new Date("2026-04-07T00:00:00.000Z"),
      nextLink,
    });

    expect(calls[0]).toBe(nextLink);
  });

  it("raises on a non-OK response so the failure is classified and retried", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 503 })));

    await expect(
      getOutlookMessagesInRange({
        accessToken: "token",
        rangeStart: new Date("2026-04-01T00:00:00.000Z"),
        rangeEnd: new Date("2026-04-07T00:00:00.000Z"),
      }),
    ).rejects.toThrow(/503/);
  });
});
