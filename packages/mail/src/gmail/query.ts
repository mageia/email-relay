/**
 * Gmail's `q` parameter accepts epoch seconds for `after:`/`before:`.
 *
 * Note: Google's published operator reference only documents the `YYYY/MM/DD`
 * form; epoch seconds are a long-standing undocumented behaviour, used here to
 * avoid the timezone ambiguity of the date form.
 *
 * `after:` is inclusive and `before:` is exclusive, so the end bound is advanced by
 * one day. Callers pass midnight of the selected end date and expect that whole day
 * to be included, matching the IMAP SINCE/BEFORE handling.
 */
export function buildGmailRangeQuery(range: { rangeStart: Date; rangeEnd: Date }) {
  const after = Math.floor(range.rangeStart.getTime() / 1000);
  const beforeExclusive = range.rangeEnd.getTime() + 24 * 60 * 60 * 1000;
  const before = Math.ceil(beforeExclusive / 1000);

  return `after:${after} before:${before}`;
}
