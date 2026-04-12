import { describe, expect, it } from "vitest";

import { mapOutlookFolders } from "./folders";

describe("mapOutlookFolders", () => {
  it("normalizes Graph mailFolders into the mailbox_folder shape", () => {
    expect(
      mapOutlookFolders([
        { id: "inbox-id", displayName: "Inbox", wellKnownName: "inbox" },
        { id: "archive-id", displayName: "Archive", wellKnownName: undefined },
      ]),
    ).toEqual([
      { id: "inbox-id", name: "Inbox", kind: "system", selected: true },
      { id: "archive-id", name: "Archive", kind: "custom", selected: false },
    ]);
  });
});
