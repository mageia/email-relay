import { mailMessage } from "@email-relay/db/schema/mail";

export async function upsertNormalizedMessage(
  db: any,
  input: {
    mailboxId: string;
    providerMessageId: string;
    internetMessageId: string | null;
    subject: string;
    snippet: string;
    fromJson: string;
    toJson: string;
    ccJson: string;
    bodyHtml: string;
    bodyText: string;
    isRead: boolean;
    receivedAt: Date;
    sentAt: Date | null;
  },
) {
  const [created] = await db.insert(mailMessage).values(input).returning({ id: mailMessage.id });
  return created.id;
}
