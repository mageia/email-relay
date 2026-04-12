function decodeBody(data?: string) {
  return data ? Buffer.from(data, "base64url").toString("utf8") : "";
}

function findHeader(headers: Array<{ name: string; value: string }> | undefined, name: string) {
  return headers?.find((header) => header.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

export function normalizeGmailMessage(message: any) {
  const headers = message.payload?.headers ?? [];

  return {
    providerMessageId: message.id,
    internetMessageId: findHeader(headers, "Message-Id") || null,
    subject: findHeader(headers, "Subject"),
    snippet: message.snippet ?? "",
    fromJson: JSON.stringify([{ raw: findHeader(headers, "From") }]),
    toJson: JSON.stringify([{ raw: findHeader(headers, "To") }]),
    ccJson: JSON.stringify([{ raw: findHeader(headers, "Cc") }]),
    bodyHtml: message.payload?.mimeType === "text/html" ? decodeBody(message.payload?.body?.data) : "",
    bodyText:
      message.payload?.mimeType === "text/plain"
        ? decodeBody(message.payload?.body?.data)
        : decodeBody(message.payload?.body?.data),
    receivedAt: new Date(Number(message.internalDate)),
    sentAt: findHeader(headers, "Date") ? new Date(findHeader(headers, "Date")) : null,
    isRead: !(message.labelIds ?? []).includes("UNREAD"),
    attachments: [] as Array<never>,
  };
}
