import { createDb } from "@email-relay/db";
import { mailbox } from "@email-relay/db/schema/mail";
import {
  MailSyncPayloadSchema,
  createMailboxCredentialStore,
  normalizeGmailMessage,
  upsertNormalizedMessage,
} from "@email-relay/mail";

async function fetchGmailMessages(accessToken: string, labelIds: string[]) {
  const query = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
  labelIds.forEach((labelId) => query.searchParams.append("labelIds", labelId));
  query.searchParams.set("maxResults", "50");

  const listResponse = await fetch(query, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!listResponse.ok) {
    throw new Error(`Gmail list failed: ${listResponse.status}`);
  }

  const listBody = (await listResponse.json()) as { messages?: Array<{ id: string }> };

  return Promise.all(
    (listBody.messages ?? []).map(async ({ id }) => {
      const detailResponse = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );

      if (!detailResponse.ok) {
        throw new Error(`Gmail get failed: ${detailResponse.status}`);
      }

      return detailResponse.json();
    }),
  );
}

export async function handleMailQueue(batch: MessageBatch<unknown>, env: Env) {
  const db = createDb();
  const credentialStore = createMailboxCredentialStore(db, env.MAILBOX_CREDENTIALS_SECRET);

  for (const message of batch.messages) {
    const payload = MailSyncPayloadSchema.parse(message.body);
    if (payload.provider !== "gmail") {
      message.ack();
      continue;
    }

    const mailboxes = await db.select().from(mailbox);
    const mailboxRow = mailboxes.find((entry: { id: string }) => entry.id === payload.mailboxId);

    if (!mailboxRow) {
      message.ack();
      continue;
    }

    const credentials = await credentialStore.readOauthTokens(payload.mailboxId);
    if (!credentials?.accessToken) {
      throw new Error(`Missing Gmail credentials for ${payload.mailboxId}`);
    }

    const selectedLabels = JSON.parse(mailboxRow.selectedFoldersJson) as string[];
    const gmailMessages = await fetchGmailMessages(
      credentials.accessToken,
      selectedLabels.length > 0 ? selectedLabels : ["INBOX"],
    );

    for (const gmailMessage of gmailMessages) {
      const normalized = normalizeGmailMessage(gmailMessage);
      await upsertNormalizedMessage(db, {
        mailboxId: payload.mailboxId,
        ...normalized,
      });
    }

    message.ack();
  }
}
