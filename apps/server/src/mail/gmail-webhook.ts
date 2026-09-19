import { and, eq } from "drizzle-orm";
import { createDb } from "@email-relay/db";
import { mailbox } from "@email-relay/db/schema/mail";

import { decodeGmailPushBody } from "@email-relay/mail";

export async function handleGmailWebhook(request: Request, env: Env) {
  const url = new URL(request.url);
  if (url.searchParams.get("token") !== env.GOOGLE_GMAIL_PUSH_TOKEN) {
    return new Response("Forbidden", { status: 403 });
  }

  const body = (await request.json()) as { message?: { data?: string } };
  const decoded = decodeGmailPushBody(body);
  const db = createDb();
  const [mailboxRow] = await db
    .select({ id: mailbox.id })
    .from(mailbox)
    .where(and(eq(mailbox.provider, "gmail"), eq(mailbox.address, decoded.emailAddress)))
    .limit(1);

  if (!mailboxRow) {
    return new Response("Ignored", { status: 202 });
  }

  await env.MAIL_SYNC_QUEUE.send({
    provider: "gmail",
    mailboxId: mailboxRow.id,
    reason: "gmail-history",
    historyId: decoded.historyId,
  });

  return new Response("Accepted", { status: 202 });
}
