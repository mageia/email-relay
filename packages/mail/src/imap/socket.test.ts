import { describe, expect, it } from "vitest";

import { splitImapLines } from "./socket";

describe("splitImapLines", () => {
  it("splits CRLF-delimited socket chunks into protocol lines", () => {
    expect(splitImapLines("* OK ready\r\nA1 CAPABILITY\r\n")).toEqual([
      "* OK ready",
      "A1 CAPABILITY",
    ]);
  });
});
