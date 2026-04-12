import { describe, expect, it } from "vitest";

import { createMailboxRepository } from "./repository";

describe("createMailboxRepository", () => {
  it("creates a pending Gmail mailbox record with selected labels", async () => {
    const inserted: any[] = [];
    const repository = createMailboxRepository({
      insertMailbox: async (row: unknown) => inserted.push(row),
      insertFolders: async (rows: unknown[]) => inserted.push(...rows),
    } as never);

    const mailbox = await repository.createGmailMailbox({
      address: "user@example.com",
      selectedLabels: [{ id: "INBOX", name: "Inbox", kind: "system" }],
    });

    expect(mailbox.provider).toBe("gmail");
    expect(inserted.some((row) => row.providerFolderId === "INBOX")).toBe(true);
  });
});
