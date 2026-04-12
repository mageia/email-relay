import { createDb } from "@email-relay/db";
import { outlookMailboxState } from "@email-relay/db/schema/outlook";

export async function handleOutlookWebhook(request: Request, env: Env) {
  const url = new URL(request.url);
  const validationToken = url.searchParams.get("validationToken");
  if (validationToken) {
    return new Response(validationToken, {
      status: 200,
      headers: {
        "Content-Type": "text/plain",
      },
    });
  }

  const body = (await request.json()) as {
    value?: Array<{
      subscriptionId: string;
      clientState: string;
      resourceData?: { id?: string };
    }>;
  };

  if (!body.value?.length) {
    return new Response("Ignored", { status: 202 });
  }

  if (body.value.some((item) => item.clientState !== env.MICROSOFT_NOTIFICATION_SECRET)) {
    return new Response("Forbidden", { status: 403 });
  }

  const db = createDb();
  const states = await db.select().from(outlookMailboxState);

  for (const item of body.value) {
    const state = states.find(
      (entry: { subscriptionId?: string | null; mailboxId: string; deltaLink?: string | null }) =>
        entry.subscriptionId === item.subscriptionId,
    );
    if (!state) {
      continue;
    }

    await env.MAIL_SYNC_QUEUE.send({
      provider: "outlook",
      mailboxId: state.mailboxId,
      reason: "outlook-delta",
      deltaLink: state.deltaLink ?? undefined,
    });
  }

  return new Response("Accepted", { status: 202 });
}
