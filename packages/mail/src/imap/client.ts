import { openImapSocket, splitImapLines } from "./socket";

function parseListFolderName(line: string) {
  const marker = ' "/" ';
  const index = line.indexOf(marker);
  if (index === -1) {
    return null;
  }

  return line.slice(index + marker.length).replace(/^"|"$/g, "");
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

  const responses: string[] = [];
  const readChunk = async () => {
    const { value, done } = await reader.read();
    if (done || !value) {
      return;
    }

    responses.push(...splitImapLines(new TextDecoder().decode(value)));
  };

  await readChunk();
  await writer.write(new TextEncoder().encode(`A1 LOGIN "${input.username}" "${input.password}"\r\n`));
  await readChunk();
  await writer.write(new TextEncoder().encode('A2 LIST "" "*"\r\n'));
  await readChunk();
  await writer.write(new TextEncoder().encode("A3 LOGOUT\r\n"));

  const ok = responses.some((line) => line.includes("A1 OK"));
  if (!ok) {
    throw new Error("IMAP login failed");
  }

  const folders = responses
    .filter((line) => line.startsWith("* LIST"))
    .map(parseListFolderName)
    .filter((value): value is string => Boolean(value));

  return { folders };
}

async function sendTaggedCommand(
  writer: WritableStreamDefaultWriter<Uint8Array>,
  reader: ReadableStreamDefaultReader<Uint8Array>,
  tag: string,
  command: string,
) {
  await writer.write(new TextEncoder().encode(`${tag} ${command}\r\n`));

  let text = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done || !value) {
      break;
    }

    text += new TextDecoder().decode(value);
    if (text.includes(`\r\n${tag} `) || text.startsWith(`${tag} `)) {
      break;
    }
  }

  return text;
}

function parseSearchUids(response: string) {
  const searchLine = splitImapLines(response).find((line) => line.startsWith("* SEARCH"));
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

function parseInternalDate(response: string) {
  const match = response.match(/INTERNALDATE \"([^\"]+)\"/);
  return match?.[1] ? new Date(match[1]) : new Date();
}

function parseLiteralRawMessage(response: string) {
  const okIndex = response.lastIndexOf("\r\nA");
  if (okIndex === -1) {
    return response;
  }

  const literalStart = response.indexOf("\r\n");
  if (literalStart === -1) {
    return response;
  }

  return response.slice(literalStart + 2, okIndex);
}

export async function fetchImapFolderMessages(input: {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
  folderId: string;
  uidSearch?: string;
  limit: number;
}) {
  const socket = await openImapSocket(input);
  const writer = socket.writable.getWriter();
  const reader = socket.readable.getReader();

  await reader.read(); // greeting
  await sendTaggedCommand(writer, reader, "A1", `LOGIN "${input.username}" "${input.password}"`);
  await sendTaggedCommand(writer, reader, "A2", `SELECT "${input.folderId}"`);
  const searchResponse = await sendTaggedCommand(
    writer,
    reader,
    "A3",
    `UID SEARCH ${input.uidSearch ?? "ALL"}`,
  );
  const uids = parseSearchUids(searchResponse).slice(-input.limit);

  const messages: Array<{ uid: number; raw: string; folderId: string; internalDate: Date }> = [];

  for (const uid of uids) {
    const fetchResponse = await sendTaggedCommand(
      writer,
      reader,
      "A4",
      `UID FETCH ${uid} (UID INTERNALDATE BODY.PEEK[])`,
    );
    messages.push({
      uid,
      folderId: input.folderId,
      internalDate: parseInternalDate(fetchResponse),
      raw: parseLiteralRawMessage(fetchResponse),
    });
  }

  await sendTaggedCommand(writer, reader, "A5", "LOGOUT");
  return messages;
}
