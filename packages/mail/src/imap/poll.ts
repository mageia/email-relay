const IMAP_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** IMAP SEARCH date literals are `DD-Mon-YYYY` (RFC 3501), always in UTC here. */
export function toImapSearchDate(value: Date) {
  const day = String(value.getUTCDate()).padStart(2, "0");
  const month = IMAP_MONTHS[value.getUTCMonth()];
  const year = value.getUTCFullYear();

  return `${day}-${month}-${year}`;
}

/**
 * Builds the UID SEARCH criteria for a poll or a backfill.
 *
 * Incremental polls walk forward from the last seen UID. Backfills ignore the
 * cursor entirely and search the requested date window instead, otherwise a
 * backfill of older mail would never reach messages below the cursor.
 *
 * SINCE is inclusive and BEFORE is exclusive per RFC 3501, so `rangeEnd` is
 * advanced by one day to keep the window inclusive of its last day.
 */
export function nextUidWindow(input: {
  lastSeenUid: number | null;
  range?: { rangeStart: Date; rangeEnd: Date } | null;
}) {
  if (input.range) {
    const beforeExclusive = new Date(input.range.rangeEnd.getTime() + 24 * 60 * 60 * 1000);

    return {
      search: `SINCE ${toImapSearchDate(input.range.rangeStart)} BEFORE ${toImapSearchDate(beforeExclusive)}`,
    };
  }

  return {
    search: input.lastSeenUid ? `UID ${input.lastSeenUid + 1}:*` : "ALL",
  };
}
