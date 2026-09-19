import { openImapSocket } from "./socket";

const CR = 13;
const LF = 10;

/**
 * Quotes a value as an IMAP quoted-string (RFC 3501 §4.3).
 * Backslash and double-quote must be escaped, otherwise a password containing
 * either character breaks out of the argument and corrupts the command.
 */
export function quoteImapString(value: string) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * Decodes protocol bytes with a strict 1:1 byte-to-char mapping.
 *
 * Literal byte counts in IMAP responses are byte counts. Decoding as UTF-8 would
 * make string indices diverge from byte offsets, so protocol scanning always uses
 * latin1 and message payloads are kept as raw bytes.
 */
const protocolDecoder = new TextDecoder("latin1");

function concatBytes(left: Uint8Array, right: Uint8Array) {
  const merged = new Uint8Array(left.length + right.length);
  merged.set(left, 0);
  merged.set(right, left.length);
  return merged;
}

function indexOfCrlf(bytes: Uint8Array, from: number) {
  for (let index = from; index + 1 < bytes.length; index += 1) {
    if (bytes[index] === CR && bytes[index + 1] === LF) {
      return index;
    }
  }

  return -1;
}

/**
 * Extracts the mailbox name from an untagged LIST response.
 *
 * The hierarchy delimiter is server-defined (commonly "/" or "."), and may also be
 * NIL, so it is read from the response rather than assumed.
 *
 * Example: * LIST (\HasNoChildren) "." INBOX.Archive
 */
export function parseListFolderName(line: string) {
  // Strip the flag list first so a delimiter-like token inside it cannot match.
  const flagsEnd = line.indexOf(")");
  if (flagsEnd === -1) {
    return null;
  }

  const rest = line.slice(flagsEnd + 1).trimStart();

  // Delimiter is either a quoted char or the atom NIL.
  const quotedDelimiter = rest.match(/^"(?:\\.|[^"])*"\s+/);
  const nilDelimiter = rest.match(/^NIL\s+/i);
  const delimiterMatch = quotedDelimiter ?? nilDelimiter;
  if (!delimiterMatch) {
    return null;
  }

  const name = rest.slice(delimiterMatch[0].length).trim();
  if (!name) {
    return null;
  }

  // The name itself may be quoted, in which case unescape it.
  if (name.startsWith('"') && name.endsWith('"') && name.length >= 2) {
    return name.slice(1, -1).replace(/\\(["\\])/g, "$1");
  }

  return name;
}

export type ImapResponse = {
  /** Protocol lines only; literal payloads are excluded. */
  lines: string[];
  /** Literal payloads in the order they appeared, as raw bytes. */
  literals: Uint8Array[];
};

/**
 * Splits a buffered IMAP response into protocol lines and literal payloads.
 *
 * Literals are introduced by a `{n}` byte count and their contents are opaque: an
 * email body can contain anything, including bytes that look like a tagged status
 * line. Scanning therefore skips exactly `n` bytes rather than pattern-matching the
 * whole buffer, and literal bytes are never mixed into `lines`.
 *
 * Returns `null` when the buffer does not yet contain a complete tagged response.
 */
export function scanImapResponse(
  bytes: Uint8Array,
  tag: string,
): (ImapResponse & { consumed: number }) | null {
  const lines: string[] = [];
  const literals: Uint8Array[] = [];
  let position = 0;

  while (position < bytes.length) {
    const crlf = indexOfCrlf(bytes, position);
    if (crlf === -1) {
      return null;
    }

    const line = protocolDecoder.decode(bytes.subarray(position, crlf));
    position = crlf + 2;

    const literalMatch = line.match(/\{(\d+)\}$/);
    if (literalMatch?.[1]) {
      const literalLength = Number(literalMatch[1]);
      if (bytes.length < position + literalLength) {
        return null;
      }

      literals.push(bytes.slice(position, position + literalLength));
      position += literalLength;
      lines.push(line);
      continue;
    }

    lines.push(line);

    if (line.startsWith(`${tag} `)) {
      return { lines, literals, consumed: position };
    }
  }

  return null;
}

/**
 * Sequential tagged-command channel over a single IMAP connection.
 * Bytes left over from one response are carried into the next read, so a socket
 * chunk spanning two responses is not lost.
 */
function createImapChannel(
  writer: WritableStreamDefaultWriter<Uint8Array>,
  reader: ReadableStreamDefaultReader<Uint8Array>,
) {
  const encoder = new TextEncoder();
  let counter = 0;
  let carry = new Uint8Array(0);

  const readMore = async () => {
    const { value, done } = await reader.read();
    if (done || !value) {
      return false;
    }

    carry = concatBytes(carry, value);
    return true;
  };

  return {
    async greeting() {
      while (indexOfCrlf(carry, 0) === -1) {
        if (!(await readMore())) {
          break;
        }
      }

      const crlf = indexOfCrlf(carry, 0);
      carry = crlf === -1 ? new Uint8Array(0) : carry.slice(crlf + 2);
    },

    async send(command: string): Promise<{ tag: string } & ImapResponse> {
      counter += 1;
      const tag = `A${counter}`;
      await writer.write(encoder.encode(`${tag} ${command}\r\n`));

      let scanned = scanImapResponse(carry, tag);
      while (!scanned) {
        if (!(await readMore())) {
          break;
        }
        scanned = scanImapResponse(carry, tag);
      }

      if (!scanned) {
        throw new Error(`IMAP connection closed before completing ${command.split(" ")[0]}`);
      }

      carry = carry.slice(scanned.consumed);
      return { tag, lines: scanned.lines, literals: scanned.literals };
    },
  };
}

/**
 * Asserts the tagged status line reports OK.
 * Only protocol lines are inspected, so a status-like line inside a message body
 * cannot produce a false failure.
 */
function assertTaggedOk(response: { tag: string; lines: string[] }, action: string) {
  const status = response.lines.find((line) => line.startsWith(`${response.tag} `));
  if (!status) {
    throw new Error(`IMAP ${action} did not return a tagged response`);
  }

  if (!/^\S+\s+OK\b/i.test(status)) {
    throw new Error(`IMAP ${action} failed: ${status}`);
  }
}

export async function validateImapLogin(input: {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
}) {
  const socket = await openImapSocket(input);
  const writer = socket.writable.getWriter();
  const reader = socket.readable.getReader();

  try {
    const channel = createImapChannel(writer, reader);
    await channel.greeting();

    const login = await channel.send(
      `LOGIN ${quoteImapString(input.username)} ${quoteImapString(input.password)}`,
    );
    assertTaggedOk(login, "LOGIN");

    const list = await channel.send('LIST "" "*"');
    assertTaggedOk(list, "LIST");

    const folders = list.lines
      .filter((line) => line.startsWith("* LIST"))
      .map(parseListFolderName)
      .filter((value): value is string => Boolean(value));

    await channel.send("LOGOUT").catch(() => undefined);

    return { folders };
  } finally {
    // Always release the socket; a leaked connection would otherwise hold an
    // authenticated session open on the server.
    await closeQuietly(writer, reader, socket);
  }
}

async function closeQuietly(
  writer: WritableStreamDefaultWriter<Uint8Array>,
  reader: ReadableStreamDefaultReader<Uint8Array>,
  socket: { close?: () => Promise<void> | void },
) {
  try {
    reader.releaseLock();
  } catch {
    // reader may already be released
  }

  try {
    writer.releaseLock();
  } catch {
    // writer may already be released
  }

  try {
    await socket.close?.();
  } catch {
    // socket may already be closed by the peer
  }
}

export function parseSearchUids(lines: string[]) {
  const searchLine = lines.find((line) => line.startsWith("* SEARCH"));
  if (!searchLine) {
    return [];
  }

  return searchLine
    .replace("* SEARCH", "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
}

export function parseInternalDate(lines: string[]) {
  for (const line of lines) {
    const match = line.match(/INTERNALDATE "([^"]+)"/);
    if (!match?.[1]) {
      continue;
    }

    const parsed = new Date(match[1]);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return new Date();
}

export type ImapFetchedMessage = {
  uid: number;
  raw: Uint8Array;
  folderId: string;
  internalDate: Date;
};

export async function fetchImapFolderMessages(input: {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
  folderId: string;
  uidSearch?: string;
  limit: number;
  /** Only fetch UIDs strictly greater than this, used to page a large result set. */
  afterUid?: number | null;
}): Promise<{ messages: ImapFetchedMessage[]; hasMore: boolean; lastUid: number | null }> {
  const socket = await openImapSocket(input);
  const writer = socket.writable.getWriter();
  const reader = socket.readable.getReader();

  try {
    const channel = createImapChannel(writer, reader);
    await channel.greeting();

    const login = await channel.send(
      `LOGIN ${quoteImapString(input.username)} ${quoteImapString(input.password)}`,
    );
    assertTaggedOk(login, "LOGIN");

    const select = await channel.send(`SELECT ${quoteImapString(input.folderId)}`);
    assertTaggedOk(select, `SELECT ${input.folderId}`);

    const search = await channel.send(`UID SEARCH ${input.uidSearch ?? "ALL"}`);
    assertTaggedOk(search, "UID SEARCH");

    // Ascending order keeps paging monotonic regardless of server response order.
    const matched = parseSearchUids(search.lines).sort((left, right) => left - right);
    const pending =
      typeof input.afterUid === "number"
        ? matched.filter((uid) => uid > input.afterUid!)
        : matched;
    const uids = pending.slice(0, input.limit);
    const messages: ImapFetchedMessage[] = [];

    for (const uid of uids) {
      const fetched = await channel.send(`UID FETCH ${uid} (UID INTERNALDATE BODY.PEEK[])`);
      assertTaggedOk(fetched, `UID FETCH ${uid}`);

      // The body arrives as a literal; keep the bytes so the MIME parser can apply
      // the charset declared in the headers.
      const raw = fetched.literals[0] ?? new Uint8Array(0);

      messages.push({
        uid,
        folderId: input.folderId,
        internalDate: parseInternalDate(fetched.lines),
        raw,
      });
    }

    await channel.send("LOGOUT").catch(() => undefined);

    return {
      messages,
      hasMore: pending.length > uids.length,
      lastUid: uids.length > 0 ? (uids[uids.length - 1] ?? null) : null,
    };
  } finally {
    await closeQuietly(writer, reader, socket);
  }
}
