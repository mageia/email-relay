import { describe, expect, it } from "vitest";

import {
  parseInternalDate,
  parseListFolderName,
  parseSearchUids,
  quoteImapString,
  scanImapResponse,
} from "./client";

const encoder = new TextEncoder();
const bytes = (value: string) => encoder.encode(value);

/** Builds a FETCH response whose literal byte count is computed from real bytes. */
function fetchResponse(body: string, tag = "A4") {
  const bodyBytes = encoder.encode(body);
  const head = encoder.encode(`* 1 FETCH (UID 5 BODY[] {${bodyBytes.length}}\r\n`);
  const tail = encoder.encode(`)\r\n${tag} OK FETCH completed\r\n`);

  const merged = new Uint8Array(head.length + bodyBytes.length + tail.length);
  merged.set(head, 0);
  merged.set(bodyBytes, head.length);
  merged.set(tail, head.length + bodyBytes.length);
  return merged;
}

describe("quoteImapString", () => {
  // Regression: credentials were interpolated raw, so a password containing a quote
  // or backslash escaped the argument and corrupted the LOGIN command.
  it("escapes quotes and backslashes", () => {
    expect(quoteImapString('pa"ss')).toBe('"pa\\"ss"');
    expect(quoteImapString("pa\\ss")).toBe('"pa\\\\ss"');
    expect(quoteImapString('a"b\\c')).toBe('"a\\"b\\\\c"');
  });

  it("leaves ordinary values intact", () => {
    expect(quoteImapString("user@example.com")).toBe('"user@example.com"');
  });
});

describe("parseListFolderName", () => {
  it("reads the folder name when the delimiter is a slash", () => {
    expect(parseListFolderName('* LIST (\\HasNoChildren) "/" INBOX')).toBe("INBOX");
  });

  // Regression: the delimiter was hardcoded to ' "/" ', so Cyrus/Courier servers
  // using "." returned null and every folder was dropped.
  it("reads the folder name when the delimiter is a dot", () => {
    expect(parseListFolderName('* LIST (\\HasNoChildren) "." INBOX.Archive')).toBe(
      "INBOX.Archive",
    );
  });

  it("handles a NIL delimiter", () => {
    expect(parseListFolderName("* LIST (\\Noselect) NIL INBOX")).toBe("INBOX");
  });

  it("unquotes and unescapes a quoted folder name", () => {
    expect(parseListFolderName('* LIST (\\HasNoChildren) "/" "Sent Items"')).toBe("Sent Items");
    expect(parseListFolderName('* LIST () "/" "Weird\\"Name"')).toBe('Weird"Name');
  });

  it("keeps a folder name containing a closing paren", () => {
    expect(parseListFolderName('* LIST (\\HasNoChildren) "/" "Projects (2026)"')).toBe(
      "Projects (2026)",
    );
  });

  it("returns null for a malformed line", () => {
    expect(parseListFolderName("* LIST garbage")).toBeNull();
  });
});

describe("scanImapResponse", () => {
  it("returns null until the tagged response is complete", () => {
    expect(scanImapResponse(bytes("* SEARCH 1 2\r\n"), "A3")).toBeNull();
  });

  it("collects protocol lines and stops at the tagged line", () => {
    const response = "* SEARCH 1 2 42\r\nA3 OK done\r\n";
    const scanned = scanImapResponse(bytes(response), "A3");

    expect(scanned?.lines).toEqual(["* SEARCH 1 2 42", "A3 OK done"]);
    expect(scanned?.consumed).toBe(bytes(response).length);
  });

  // Regression: literal byte counts were applied to character indices, so any
  // non-ASCII body desynchronised the scanner and the read loop never terminated.
  it("handles a multi-byte UTF-8 literal without desynchronising", () => {
    const body = "Subject: hi\r\n\r\n你好世界";
    const scanned = scanImapResponse(fetchResponse(body), "A4");

    expect(scanned).not.toBeNull();
    expect(scanned?.lines.at(-1)).toBe("A4 OK FETCH completed");
    expect(new TextDecoder().decode(scanned?.literals[0])).toBe(body);
  });

  // Regression: slicing at the last "\r\nA" truncated any body containing that
  // sequence and could mix trailing protocol bytes into the message.
  it("does not truncate a body containing a CRLF followed by a tag-like line", () => {
    const body = "Subject: t\r\n\r\nline one\r\nA4 OK not really the tag\r\nmore";
    const scanned = scanImapResponse(fetchResponse(body), "A4");

    expect(new TextDecoder().decode(scanned?.literals[0])).toBe(body);
    expect(scanned?.lines.at(-1)).toBe("A4 OK FETCH completed");
  });

  it("returns null when the literal payload is incomplete", () => {
    const full = fetchResponse("Subject: hi\r\n\r\nbody text here");

    expect(scanImapResponse(full.slice(0, full.length - 10), "A4")).toBeNull();
  });

  it("reports consumed bytes so trailing data is carried forward", () => {
    const first = bytes("A1 OK login\r\n");
    const second = bytes("A2 OK select\r\n");
    const merged = new Uint8Array(first.length + second.length);
    merged.set(first, 0);
    merged.set(second, first.length);

    const scanned = scanImapResponse(merged, "A1");
    expect(scanned?.consumed).toBe(first.length);
    expect(new TextDecoder().decode(merged.slice(scanned!.consumed))).toBe("A2 OK select\r\n");
  });
});

describe("parseSearchUids", () => {
  it("extracts numeric UIDs", () => {
    expect(parseSearchUids(["* SEARCH 1 2 42", "A3 OK done"])).toEqual([1, 2, 42]);
  });

  it("returns an empty list when nothing matched", () => {
    expect(parseSearchUids(["* SEARCH", "A3 OK done"])).toEqual([]);
    expect(parseSearchUids(["A3 OK done"])).toEqual([]);
  });
});

describe("parseInternalDate", () => {
  it("parses the INTERNALDATE value", () => {
    expect(
      parseInternalDate(['* 1 FETCH (UID 5 INTERNALDATE "01-Apr-2026 10:30:00 +0000"']).toISOString(),
    ).toBe("2026-04-01T10:30:00.000Z");
  });

  it("falls back to now when the value is unparseable", () => {
    expect(parseInternalDate(['INTERNALDATE "not-a-date"'])).toBeInstanceOf(Date);
    expect(parseInternalDate([])).toBeInstanceOf(Date);
  });
});
