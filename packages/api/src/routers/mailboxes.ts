import { eq } from "drizzle-orm";
import { z } from "zod";

import { imapMailboxState } from "@email-relay/db/schema/imap";
import { mailbox } from "@email-relay/db/schema/mail";
import { mailboxFolder } from "@email-relay/db/schema/provider";
import {
  createMailboxCredentialStore,
  listGoogleLabels,
  validateImapMailbox,
} from "@email-relay/mail";

import { protectedProcedure } from "../index";
import { createMailboxRepository } from "../mailboxes/repository";

type MailboxFolderChoice = {
  id: string;
  name: string;
  kind: string;
  selected: boolean;
};

export async function resolveMailboxFolderChoices(input: {
  mailbox: {
    id: string;
    provider: string;
    selectedFoldersJson: string;
  };
  storedFolders: MailboxFolderChoice[];
  loadGmailLabels?: () => Promise<Array<{ id: string; name: string; kind: string }>>;
}): Promise<MailboxFolderChoice[]> {
  if (input.mailbox.provider !== "gmail") {
    return input.storedFolders;
  }

  if (!input.loadGmailLabels) {
    throw new Error("Missing Gmail label loader");
  }

  const selectedIds = new Set<string>(JSON.parse(input.mailbox.selectedFoldersJson ?? "[]"));
  const labels = await input.loadGmailLabels();

  return labels.map((label) => ({
    ...label,
    selected: selectedIds.has(label.id),
  }));
}

export const mailboxesRouter = {
  list: protectedProcedure.handler(({ context }) => createMailboxRepository(context.db).listMailboxes()),
  getFolderChoices: protectedProcedure
    .input(
      z.object({
        mailboxId: z.string().min(1),
      }),
    )
    .handler(async ({ context, input }) => {
      const [mailboxRow] = await context.db
        .select({
          id: mailbox.id,
          provider: mailbox.provider,
          selectedFoldersJson: mailbox.selectedFoldersJson,
        })
        .from(mailbox)
        .where(eq(mailbox.id, input.mailboxId))
        .limit(1);

      if (!mailboxRow) {
        throw new Error("Mailbox not found");
      }

      const storedFolders = await context.db
        .select({
          id: mailboxFolder.providerFolderId,
          name: mailboxFolder.displayName,
          kind: mailboxFolder.kind,
          selected: mailboxFolder.selected,
        })
        .from(mailboxFolder)
        .where(eq(mailboxFolder.mailboxId, input.mailboxId));

      return resolveMailboxFolderChoices({
        mailbox: mailboxRow,
        storedFolders,
        loadGmailLabels:
          mailboxRow.provider === "gmail"
            ? async () => {
                const credentialStore = createMailboxCredentialStore(
                  context.db,
                  String(context.env.MAILBOX_CREDENTIALS_SECRET ?? ""),
                );
                const credentials = await credentialStore.readOauthTokens(input.mailboxId);
                if (!credentials?.accessToken) {
                  throw new Error(`Missing Gmail credentials for ${input.mailboxId}`);
                }

                return listGoogleLabels(credentials.accessToken);
              }
            : undefined,
      });
    }),
  getImapSettings: protectedProcedure
    .input(
      z.object({
        mailboxId: z.string().min(1),
      }),
    )
    .handler(async ({ context, input }) => {
      const rows = await context.db
        .select({
          username: imapMailboxState.username,
          host: imapMailboxState.host,
          port: imapMailboxState.port,
          secure: imapMailboxState.secure,
          discoverySource: imapMailboxState.discoverySource,
        })
        .from(imapMailboxState)
        .where(eq(imapMailboxState.mailboxId, input.mailboxId))
        .limit(1);

      return rows[0] ?? null;
    }),
  validateImap: protectedProcedure
    .input(
      z.object({
        email: z.string().email(),
        username: z.string().min(1),
        password: z.string().min(1),
        host: z.string().optional(),
        port: z.number().int().positive().optional(),
        secure: z.boolean().optional(),
      }),
    )
    .handler((_ctx) => validateImapMailbox(_ctx.input)),
  createImap: protectedProcedure
    .input(
      z.object({
        email: z.string().email(),
        username: z.string().min(1),
        password: z.string().min(1),
        host: z.string().min(1),
        port: z.number().int().positive(),
        secure: z.boolean(),
        authType: z.string().min(1),
        discoverySource: z.string().min(1),
        folders: z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            kind: z.string(),
            selected: z.boolean(),
          }),
        ),
      }),
    )
    .handler(async ({ context, input }) => {
      const repository = createMailboxRepository(context.db);
      const mailboxRecord = await repository.createImapMailbox({
        address: input.email,
        username: input.username,
        host: input.host,
        port: input.port,
        secure: input.secure,
        authType: input.authType,
        discoverySource: input.discoverySource,
        selectedFolders: input.folders,
      });

      const credentialStore = createMailboxCredentialStore(
        context.db,
        String(context.env.MAILBOX_CREDENTIALS_SECRET ?? ""),
      );

      await credentialStore.saveOauthTokens({
        mailboxId: mailboxRecord.id,
        provider: "imap",
        accessToken: input.password,
      });

      return mailboxRecord;
    }),
  updateImapSettings: protectedProcedure
    .input(
      z.object({
        mailboxId: z.string().min(1),
        username: z.string().min(1),
        host: z.string().min(1),
        port: z.number().int().positive(),
        secure: z.boolean(),
        labels: z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            kind: z.string(),
          }),
        ),
      }),
    )
    .handler(({ context, input }) =>
      createMailboxRepository(context.db).updateImapMailboxSettings({
        mailboxId: input.mailboxId,
        username: input.username,
        host: input.host,
        port: input.port,
        secure: input.secure,
        selectedFolders: input.labels,
      }),
    ),
  updateSelectedFolders: protectedProcedure
    .input(
      z.object({
        mailboxId: z.string().min(1),
        labels: z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            kind: z.string(),
          }),
        ),
      }),
    )
    .handler(({ context, input }) =>
      createMailboxRepository(context.db).replaceSelectedLabels(input.mailboxId, input.labels),
    ),
};
