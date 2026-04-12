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
    expect(inserted.some((row) => (row as any).providerFolderId === "INBOX")).toBe(true);
  });

  it("updates IMAP server settings and selected folders", async () => {
    const updates: any[] = [];
    const repository = createMailboxRepository({
      updateImapState: async (mailboxId: string, patch: unknown) => updates.push({ mailboxId, patch }),
      replaceSelectedFolders: async (mailboxId: string, folders: unknown[]) => updates.push({ mailboxId, folders }),
    } as never);

    await repository.updateImapMailboxSettings({
      mailboxId: "mailbox-1",
      username: "other@example.com",
      host: "mail.example.com",
      port: 143,
      secure: true,
      selectedFolders: [
        { id: "INBOX", name: "INBOX", kind: "system" },
        { id: "Archive", name: "Archive", kind: "custom" },
      ],
    });

    expect(updates).toEqual([
      {
        mailboxId: "mailbox-1",
        patch: {
          username: "other@example.com",
          host: "mail.example.com",
          port: 143,
          secure: true,
        },
      },
      {
        mailboxId: "mailbox-1",
        folders: [
          { id: "INBOX", name: "INBOX", kind: "system" },
          { id: "Archive", name: "Archive", kind: "custom" },
        ],
      },
    ]);
  });
});
