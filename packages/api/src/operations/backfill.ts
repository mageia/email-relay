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


export async function requeueHistoryBackfillJob(input: {
  job: {
    id: string;
    mailboxId?: string | null;
    type: string;
    requestedRangeStart?: Date | number | null;
    requestedRangeEnd?: Date | number | null;
  };
  mailbox: { id: string; provider: "gmail" | "outlook" | "imap" };
  updateJob: (jobId: string, patch: { status: string; nextAttemptAt: null; startedAt: null }) => Promise<void>;
  enqueue: (payload: unknown) => Promise<void>;
}) {
  if (input.job.type != "history-backfill") {
    throw new Error(`Unsupported retry job type: ${input.job.type}`);
  }

  const rangeStart =
    input.job.requestedRangeStart instanceof Date
      ? input.job.requestedRangeStart
      : input.job.requestedRangeStart
        ? new Date(input.job.requestedRangeStart)
        : null;
  const rangeEnd =
    input.job.requestedRangeEnd instanceof Date
      ? input.job.requestedRangeEnd
      : input.job.requestedRangeEnd
        ? new Date(input.job.requestedRangeEnd)
        : null;

  if (!rangeStart || Number.isNaN(rangeStart.getTime()) || !rangeEnd || Number.isNaN(rangeEnd.getTime())) {
    throw new Error(`Retry job ${input.job.id} is missing a valid requested range`);
  }

  const [payload] = buildBackfillPayloads({
    mailboxes: [input.mailbox],
    rangeStart,
    rangeEnd,
  });

  await input.enqueue(payload);
  await input.updateJob(input.job.id, {
    status: "queued",
    nextAttemptAt: null,
    startedAt: null,
  });
}
