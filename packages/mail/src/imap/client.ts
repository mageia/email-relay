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
