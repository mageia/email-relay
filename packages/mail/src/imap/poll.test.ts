import { describe, expect, it } from "vitest";

import { nextUidWindow } from "./poll";

describe("nextUidWindow", () => {
  it("starts after the previously seen UID", () => {
    expect(nextUidWindow({ lastSeenUid: 100 })).toEqual({ search: "UID 101:*" });
  });
});
