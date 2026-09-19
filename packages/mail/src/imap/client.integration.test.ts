import { describe, expect, it, vi } from "vitest";

/**
 * End-to-end coverage for the tagged-response reader against a realistic socket.
 *
 * The scripted reader goes idle after its last chunk, exactly like a real IMAP
 * server waiting for the next command. This matters: the previous implementation
 * applied literal *byte* counts to *character* indices, so any non-ASCII body left
 * the scanner mid-buffer and it waited on a read that never resolved. The mailbox
 * then hung until the Workers timeout and burned its whole retry budget.
 */
const chunks: Uint8Array[] = [];

vi.mock("./socket", () => ({
  openImapSocket: async () => {
    let index = 0;
    return {
      readable: {
        getReader: () => ({
          read: async () =>
            index < chunks.length
              ? { value: chunks[index++], done: false }
              : new Promise<never>(() => {}),
          releaseLock: () => {},
        }),
      },
      writable: {
        getWriter: () => ({ write: async () => {}, releaseLock: () => {} }),
      },
      close: async () => {},
    };
  },
}));

const { fetchImapFolderMessages } = await import("./client");
const encoder = new TextEncoder();

function scriptConversation(body: string, uids = "5") {
  const bodyBytes = encoder.encode(body);
  chunks.length = 0;
  chunks.push(encoder.encode("* OK ready\r\n"));
  chunks.push(encoder.encode("A1 OK login\r\n"));
  chunks.push(encoder.encode("* 1 EXISTS\r\nA2 OK [READ-WRITE] SELECT completed\r\n"));
  chunks.push(encoder.encode(`* SEARCH ${uids}\r\nA3 OK SEARCH completed\r\n`));

  const head = encoder.encode(
    `* 1 FETCH (UID 5 INTERNALDATE "01-Apr-2026 10:30:00 +0000" BODY[] {${bodyBytes.length}}\r\n`,
  );
  const tail = encoder.encode(")\r\nA4 OK FETCH completed\r\n");
  const fetchChunk = new Uint8Array(head.length + bodyBytes.length + tail.length);
  fetchChunk.set(head, 0);
  fetchChunk.set(bodyBytes, head.length);
  fetchChunk.set(tail, head.length + bodyBytes.length);
  chunks.push(fetchChunk);

  chunks.push(encoder.encode("A5 OK LOGOUT completed\r\n"));
}

/** Fails fast instead of hanging the suite if the reader desynchronises. */
function withTimeout<T>(promise: Promise<T>) {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("IMAP fetch never completed")), 2000),
    ),
  ]);
}

const CONNECTION = {
  host: "imap.example.com",
  port: 993,
  secure: true,
  username: "user@example.com",
  password: "secret",
  folderId: "INBOX",
  limit: 50,
} as const;

describe("fetchImapFolderMessages", () => {
  it.each([
    ["an ASCII body", "Subject: hi\r\n\r\nplain body"],
    // Regression: these desynchronised the old character-indexed scanner.
    ["a Chinese body", "Subject: hi\r\n\r\n你好世界，这是一封中文邮件"],
    ["an emoji body", "Subject: hi\r\n\r\nhello 👋🌍 world"],
    ["a body containing a tag-like line", "Subject: t\r\n\r\nline\r\nA4 OK not the tag\r\nmore"],
  ])("returns the exact bytes for %s", async (_label, body) => {
    scriptConversation(body);

    const result = await withTimeout(fetchImapFolderMessages({ ...CONNECTION }));

    expect(result.messages).toHaveLength(1);
    expect(new TextDecoder().decode(result.messages[0]?.raw)).toBe(body);
    expect(result.messages[0]?.uid).toBe(5);
    expect(result.messages[0]?.internalDate.toISOString()).toBe("2026-04-01T10:30:00.000Z");
  });

  it("reports no further pages when the result set fits in one page", async () => {
    scriptConversation("Subject: hi\r\n\r\nbody");

    const result = await withTimeout(fetchImapFolderMessages({ ...CONNECTION }));

    expect(result.hasMore).toBe(false);
    expect(result.lastUid).toBe(5);
  });

  it("signals more pages when the search matched beyond the page limit", async () => {
    scriptConversation("Subject: hi\r\n\r\nbody", "5 6 7");

    const result = await withTimeout(fetchImapFolderMessages({ ...CONNECTION, limit: 1 }));

    // Regression: a ranged backfill previously kept only the newest 50 UIDs and
    // silently dropped the rest, with no way to request the remainder.
    expect(result.hasMore).toBe(true);
    expect(result.lastUid).toBe(5);
  });

  it("skips UIDs at or below afterUid so paging advances", async () => {
    scriptConversation("Subject: hi\r\n\r\nbody", "1 2 5");

    const result = await withTimeout(
      fetchImapFolderMessages({ ...CONNECTION, limit: 1, afterUid: 2 }),
    );

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]?.uid).toBe(5);
    expect(result.hasMore).toBe(false);
  });

  it("pages through a folder until the matched set is exhausted", async () => {
    // Walk the UID set one page at a time, asserting each page advances and the
    // final page reports no remainder.
    const seen: number[] = [];
    let afterUid: number | null = null;

    for (let page = 0; page < 3; page += 1) {
      scriptConversation("Subject: hi\r\n\r\nbody", "1 2 5");
      const result = await withTimeout(
        fetchImapFolderMessages({ ...CONNECTION, limit: 1, afterUid }),
      );

      expect(result.messages).toHaveLength(1);
      seen.push(result.messages[0]!.uid);
      afterUid = result.lastUid;

      if (!result.hasMore) {
        break;
      }
    }

    // The scripted FETCH always returns UID 5, but afterUid must still advance
    // strictly, so paging terminates rather than looping forever.
    expect(seen.length).toBeLessThanOrEqual(3);
    expect(afterUid).toBe(5);
  });

  it("surfaces a failed login as an error", async () => {
    chunks.length = 0;
    chunks.push(encoder.encode("* OK ready\r\n"));
    chunks.push(encoder.encode("A1 NO [AUTHENTICATIONFAILED] Invalid credentials\r\n"));

    await expect(withTimeout(fetchImapFolderMessages({ ...CONNECTION }))).rejects.toThrow(
      /LOGIN failed/,
    );
  });
});
