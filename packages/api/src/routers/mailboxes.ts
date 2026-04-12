import { z } from "zod";

import { createMailboxCredentialStore, validateImapMailbox } from "@email-relay/mail";
import { protectedProcedure } from "../index";
import { createMailboxRepository } from "../mailboxes/repository";

export const mailboxesRouter = {
  list: protectedProcedure.handler(({ context }) => createMailboxRepository(context.db).listMailboxes()),
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
