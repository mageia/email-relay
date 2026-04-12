import { desc, eq } from "drizzle-orm";

import { mailbox } from "@email-relay/db/schema/mail";
import { outlookMailboxState } from "@email-relay/db/schema/outlook";
import { gmailMailboxState, mailboxFolder } from "@email-relay/db/schema/provider";

type GmailLabel = { id: string; name: string; kind: string };
type OutlookFolder = { id: string; name: string; kind: string; selected: boolean };

type MailboxRepositoryDeps =
  | any
  | {
      insertMailbox: (row: { address: string; provider: string; authType: string; status: string; selectedFoldersJson: string }) => Promise<any>;
      insertFolders: (rows: Array<{ mailboxId: string; providerFolderId: string; displayName: string; kind: string; selected: boolean }>) => Promise<void>;
      insertGmailState?: (row: { mailboxId: string; gmailAddress: string }) => Promise<void>;
    };

function isStubDeps(deps: MailboxRepositoryDeps): deps is {
  insertMailbox: (row: { address: string; provider: string; authType: string; status: string; selectedFoldersJson: string }) => Promise<any>;
  insertFolders: (rows: Array<{ mailboxId: string; providerFolderId: string; displayName: string; kind: string; selected: boolean }>) => Promise<void>;
  insertGmailState?: (row: { mailboxId: string; gmailAddress: string }) => Promise<void>;
} {
  return typeof (deps as { insertMailbox?: unknown }).insertMailbox === "function";
}

export function createMailboxRepository(db: MailboxRepositoryDeps) {
  return {
    async createGmailMailbox(input: { address: string; selectedLabels: GmailLabel[] }) {
      if (isStubDeps(db)) {
        const createdMailbox = {
          id: crypto.randomUUID(),
          address: input.address,
          provider: "gmail",
          authType: "oauth",
          status: "active",
          selectedFoldersJson: JSON.stringify(input.selectedLabels.map((label) => label.id)),
        };

        await db.insertMailbox(createdMailbox);

        await db.insertFolders(
          input.selectedLabels.map((label) => ({
            mailboxId: createdMailbox.id,
            providerFolderId: label.id,
            displayName: label.name,
            kind: label.kind,
            selected: true,
          })),
        );

        await db.insertGmailState?.({
          mailboxId: createdMailbox.id,
          gmailAddress: input.address,
        });

        return createdMailbox;
      }

      const [createdMailbox] = await db
        .insert(mailbox)
        .values({
          address: input.address,
          provider: "gmail",
          authType: "oauth",
          status: "active",
          selectedFoldersJson: JSON.stringify(input.selectedLabels.map((label) => label.id)),
        })
        .returning();

      await db.insert(mailboxFolder).values(
        input.selectedLabels.map((label) => ({
          mailboxId: createdMailbox.id,
          providerFolderId: label.id,
          displayName: label.name,
          kind: label.kind,
          selected: true,
        })),
      );

      await db.insert(gmailMailboxState).values({
        mailboxId: createdMailbox.id,
        gmailAddress: input.address,
      });

      return createdMailbox;
    },

    async createOutlookMailbox(input: {
      address: string;
      selectedFolders: OutlookFolder[];
    }) {
      if (isStubDeps(db)) {
        const createdMailbox = {
          id: crypto.randomUUID(),
          address: input.address,
          provider: "outlook",
          authType: "oauth",
          status: "active",
          selectedFoldersJson: JSON.stringify(
            input.selectedFolders.filter((folder) => folder.selected).map((folder) => folder.id),
          ),
        };

        await db.insertMailbox(createdMailbox);
        await db.insertFolders(
          input.selectedFolders.map((folder) => ({
            mailboxId: createdMailbox.id,
            providerFolderId: folder.id,
            displayName: folder.name,
            kind: folder.kind,
            selected: folder.selected,
          })),
        );

        return createdMailbox;
      }

      const [createdMailbox] = await db
        .insert(mailbox)
        .values({
          address: input.address,
          provider: "outlook",
          authType: "oauth",
          status: "active",
          selectedFoldersJson: JSON.stringify(
            input.selectedFolders.filter((folder) => folder.selected).map((folder) => folder.id),
          ),
        })
        .returning();

      await db.insert(mailboxFolder).values(
        input.selectedFolders.map((folder) => ({
          mailboxId: createdMailbox.id,
          providerFolderId: folder.id,
          displayName: folder.name,
          kind: folder.kind,
          selected: folder.selected,
        })),
      );

      await db.insert(outlookMailboxState).values({
        mailboxId: createdMailbox.id,
        outlookAddress: input.address,
      });

      return createdMailbox;
    },

    async listMailboxes() {
      if (isStubDeps(db)) {
        return [];
      }

      return db.select().from(mailbox).orderBy(desc(mailbox.createdAt));
    },

    async replaceSelectedLabels(mailboxId: string, labels: GmailLabel[]) {
      if (isStubDeps(db)) {
        return;
      }

      await db.delete(mailboxFolder).where(eq(mailboxFolder.mailboxId, mailboxId));
      await db.insert(mailboxFolder).values(
        labels.map((label) => ({
          mailboxId,
          providerFolderId: label.id,
          displayName: label.name,
          kind: label.kind,
          selected: true,
        })),
      );
      await db
        .update(mailbox)
        .set({
          selectedFoldersJson: JSON.stringify(labels.map((label) => label.id)),
        })
        .where(eq(mailbox.id, mailboxId));
    },
  };
}
