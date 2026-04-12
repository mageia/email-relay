export function buildBackfillPayloads(input: {
  mailboxes: Array<{ id: string; provider: "gmail" | "outlook" | "imap" }>;
  rangeStart: Date;
  rangeEnd: Date;
}) {
  return input.mailboxes.map((mailbox) => {
    const reason =
      mailbox.provider === "gmail"
        ? "gmail-backfill"
        : mailbox.provider === "outlook"
          ? "outlook-backfill"
          : "imap-backfill";

    return {
      provider: mailbox.provider,
      mailboxId: mailbox.id,
      reason,
      rangeStart: input.rangeStart.toISOString(),
      rangeEnd: input.rangeEnd.toISOString(),
    };
  });
}
