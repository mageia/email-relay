export async function normalizeImapMessage(input: {
  uid: number;
  raw: string;
  folderId: string;
  internalDate: Date;
}) {
  const [rawHeaders = "", ...bodyParts] = input.raw.split("\r\n\r\n");
  const body = bodyParts.join("\r\n\r\n");
  const headerMap = new Map<string, string>();

  for (const line of rawHeaders.split("\r\n")) {
    const index = line.indexOf(":");
    if (index === -1) {
      continue;
    }

    const key = line.slice(0, index).trim().toLowerCase();
    const value = line.slice(index + 1).trim();
    headerMap.set(key, value);
  }

  const contentType = headerMap.get("content-type")?.toLowerCase() ?? "text/plain";
  const subject = headerMap.get("subject") ?? "";
  const from = headerMap.get("from");
  const to = headerMap.get("to");
  const cc = headerMap.get("cc");
  const messageId = headerMap.get("message-id") ?? null;
  const sentAtText = headerMap.get("date");

  return {
    providerMessageId: `${input.folderId}:${input.uid}`,
    internetMessageId: messageId,
    subject,
    snippet: body.slice(0, 160),
    fromJson: JSON.stringify(from ? [{ raw: from }] : []),
    toJson: JSON.stringify(to ? [{ raw: to }] : []),
    ccJson: JSON.stringify(cc ? [{ raw: cc }] : []),
    bodyHtml: contentType.includes("text/html") ? body : "",
    bodyText: contentType.includes("text/plain") ? body : body,
    isRead: false,
    receivedAt: input.internalDate,
    sentAt: sentAtText ? new Date(sentAtText) : input.internalDate,
    attachments: [] as Array<never>,
  };
}
