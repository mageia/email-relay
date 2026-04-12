import { describe, expect, it } from "vitest";

import { resolveMailboxFolderChoices } from "./mailboxes";

describe("resolveMailboxFolderChoices", () => {
  it("maps live Gmail labels with selected state from mailbox settings", async () => {
    await expect(
      resolveMailboxFolderChoices({
        mailbox: {
          id: "mailbox-1",
          provider: "gmail",
          selectedFoldersJson: JSON.stringify(["INBOX", "STARRED"]),
        },
        storedFolders: [],
        loadGmailLabels: async () => [
          { id: "INBOX", name: "Inbox", kind: "system" },
          { id: "STARRED", name: "Starred", kind: "system" },
          { id: "Label_1", name: "Projects", kind: "user" },
        ],
      }),
    ).resolves.toEqual([
      { id: "INBOX", name: "Inbox", kind: "system", selected: true },
      { id: "STARRED", name: "Starred", kind: "system", selected: true },
      { id: "Label_1", name: "Projects", kind: "user", selected: false },
    ]);
  });

  it("returns stored folder rows for non-Gmail providers", async () => {
    await expect(
      resolveMailboxFolderChoices({
        mailbox: {
          id: "mailbox-2",
          provider: "outlook",
          selectedFoldersJson: JSON.stringify(["inbox"]),
        },
        storedFolders: [
          { id: "inbox", name: "Inbox", kind: "system", selected: true },
          { id: "archive", name: "Archive", kind: "custom", selected: false },
        ],
      }),
    ).resolves.toEqual([
      { id: "inbox", name: "Inbox", kind: "system", selected: true },
      { id: "archive", name: "Archive", kind: "custom", selected: false },
    ]);
  });
});
