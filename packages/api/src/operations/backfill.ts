import { buildBackfillPayloads } from "@email-relay/mail";

export async function enqueueMailboxBackfill(input: {
  mailbox: { id: string; provider: "gmail" | "outlook" | "imap" };
  rangeStart: Date;
  rangeEnd: Date;
  requestedBy: string;
  insertJob: (job: {
    mailboxId: string;
    type: string;
    status: string;
    requestedBy: string;
    requestedRangeStart: Date;
    requestedRangeEnd: Date;
  }) => Promise<void>;
  enqueue: (payload: unknown) => Promise<void>;
}) {
  await input.insertJob({
    mailboxId: input.mailbox.id,
    type: "history-backfill",
    status: "queued",
    requestedBy: input.requestedBy,
    requestedRangeStart: input.rangeStart,
    requestedRangeEnd: input.rangeEnd,
  });

  const [payload] = buildBackfillPayloads({
    mailboxes: [input.mailbox],
    rangeStart: input.rangeStart,
    rangeEnd: input.rangeEnd,
  });

  await input.enqueue(payload);
}

export async function enqueueGroupBackfill(input: {
  mailboxes: Array<{ id: string; provider: "gmail" | "outlook" | "imap" }>;
  rangeStart: Date;
  rangeEnd: Date;
  requestedBy: string;
  insertJob: (job: {
    mailboxId?: string;
    groupId?: string;
    type: string;
    status: string;
    requestedBy: string;
    requestedRangeStart: Date;
    requestedRangeEnd: Date;
  }) => Promise<void>;
  enqueue: (payload: unknown) => Promise<void>;
  groupId: string;
}) {
  const payloads = buildBackfillPayloads({
    mailboxes: input.mailboxes,
    rangeStart: input.rangeStart,
    rangeEnd: input.rangeEnd,
  });

  for (const mailbox of input.mailboxes) {
    await input.insertJob({
      mailboxId: mailbox.id,
      groupId: input.groupId,
      type: "history-backfill",
      status: "queued",
      requestedBy: input.requestedBy,
      requestedRangeStart: input.rangeStart,
      requestedRangeEnd: input.rangeEnd,
    });
  }

  for (const payload of payloads) {
    await input.enqueue(payload);
  }
}
