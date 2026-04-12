import { desc, eq } from "drizzle-orm";

import { imapMailboxState } from "@email-relay/db/schema/imap";
import { mailbox } from "@email-relay/db/schema/mail";
import { outlookMailboxState } from "@email-relay/db/schema/outlook";
import { gmailMailboxState, mailboxFolder } from "@email-relay/db/schema/provider";

type GmailLabel = { id: string; name: string; kind: string };
type OutlookFolder = { id: string; name: string; kind: string; selected: boolean };
type ImapFolder = { id: string; name: string; kind: string; selected: boolean };

type MailboxRepositoryDeps =
  | any
  | {
      insertMailbox?: (row: { address: string; provider: string; authType: string; status: string; selectedFoldersJson: string }) => Promise<any>;
      insertFolders?: (rows: Array<{ mailboxId: string; providerFolderId: string; displayName: string; kind: string; selected: boolean }>) => Promise<void>;
      insertGmailState?: (row: { mailboxId: string; gmailAddress: string }) => Promise<void>;
      updateImapState?: (mailboxId: string, patch: { username: string; host: string; port: number; secure: boolean }) => Promise<void>;
      replaceSelectedFolders?: (mailboxId: string, labels: GmailLabel[]) => Promise<void>;
    };

function isStubDeps(deps: MailboxRepositoryDeps): deps is NonNullable<MailboxRepositoryDeps> {
  return typeof deps === "object" && deps !== null && ("insertMailbox" in deps || "updateImapState" in deps || "replaceSelectedFolders" in deps);
}

function toSelectedFolderIds(labels: GmailLabel[]) {
  return JSON.stringify(labels.map((label) => label.id));
}

export function createMailboxRepository(db: MailboxRepositoryDeps) {
  return {
    async createGmailMailbox(input: { address: string; selectedLabels: GmailLabel[] }) {
      if (isStubDeps(db) && db.insertMailbox && db.insertFolders) {
        const createdMailbox = {
          id: crypto.randomUUID(),
          address: input.address,
          provider: "gmail",
          authType: "oauth",
          status: "active",
          selectedFoldersJson: toSelectedFolderIds(input.selectedLabels),
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
          selectedFoldersJson: toSelectedFolderIds(input.selectedLabels),
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

    async createOutlookMailbox(input: { address: string; selectedFolders: OutlookFolder[] }) {
      if (isStubDeps(db) && db.insertMailbox && db.insertFolders) {
        const createdMailbox = {
          id: crypto.randomUUID(),
          address: input.address,
          provider: "outlook",
          authType: "oauth",
          status: "active",
          selectedFoldersJson: JSON.stringify(input.selectedFolders.filter((folder) => folder.selected).map((folder) => folder.id)),
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
          selectedFoldersJson: JSON.stringify(input.selectedFolders.filter((folder) => folder.selected).map((folder) => folder.id)),
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

    async createImapMailbox(input: {
      address: string;
      username: string;
      host: string;
      port: number;
      secure: boolean;
      authType: string;
      discoverySource: string;
      selectedFolders: ImapFolder[];
    }) {
      const [createdMailbox] = await db
        .insert(mailbox)
        .values({
          address: input.address,
          provider: "imap",
          authType: input.authType,
          status: "active",
          selectedFoldersJson: JSON.stringify(input.selectedFolders.filter((folder) => folder.selected).map((folder) => folder.id)),
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

      await db.insert(imapMailboxState).values({
        mailboxId: createdMailbox.id,
        username: input.username,
        host: input.host,
        port: input.port,
        secure: input.secure,
        authType: input.authType,
        discoverySource: input.discoverySource,
        lastValidatedAt: new Date(),
      });

      return createdMailbox;
    },

    async listMailboxes() {
      if (isStubDeps(db) && !('select' in db)) {
        return [];
      }

      return db.select().from(mailbox).orderBy(desc(mailbox.createdAt));
    },

    async replaceSelectedLabels(mailboxId: string, labels: GmailLabel[]) {
      if (isStubDeps(db) && db.replaceSelectedFolders) {
        await db.replaceSelectedFolders(mailboxId, labels);
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
          selectedFoldersJson: toSelectedFolderIds(labels),
        })
        .where(eq(mailbox.id, mailboxId));
    },

    async updateImapMailboxSettings(input: {
      mailboxId: string;
      username: string;
      host: string;
      port: number;
      secure: boolean;
      selectedFolders: GmailLabel[];
    }) {
      if (isStubDeps(db) && db.updateImapState && db.replaceSelectedFolders) {
        await db.updateImapState(input.mailboxId, {
          username: input.username,
          host: input.host,
          port: input.port,
          secure: input.secure,
        });
        await db.replaceSelectedFolders(input.mailboxId, input.selectedFolders);
        return;
      }

      await db
        .update(imapMailboxState)
        .set({
          username: input.username,
          host: input.host,
          port: input.port,
          secure: input.secure,
          updatedAt: new Date(),
        })
        .where(eq(imapMailboxState.mailboxId, input.mailboxId));

      await this.replaceSelectedLabels(input.mailboxId, input.selectedFolders);
    },
  };
}
