import PostalMime from "postal-mime";
import type { Address } from "postal-mime";

function recipientsToJson(value?: Address | Address[]) {
  if (!value) {
    return "[]";
  }

  const entries = Array.isArray(value) ? value : [value];
  return JSON.stringify(entries);
}

function measureContentSize(content?: ArrayBuffer | Uint8Array | string) {
  if (!content) {
    return 0;
  }

  if (typeof content === "string") {
    return new TextEncoder().encode(content).byteLength;
  }

  if (ArrayBuffer.isView(content)) {
    return content.byteLength;
  }

  if (content instanceof ArrayBuffer) {
    return content.byteLength;
  }

  return 0;
}

export async function normalizeImapMessage(input: {
  uid: number;
  raw: string;
  folderId: string;
  internalDate: Date;
}) {
  const parser = new PostalMime();
  const parsed = await parser.parse(input.raw);
  const snippetSource = parsed.text ?? parsed.html ?? "";
  const snippet = snippetSource.slice(0, 160);

  const attachments = (parsed.attachments ?? []).map((attachment) => ({
    filename: attachment.filename ?? "attachment",
    mimeType: attachment.mimeType ?? "application/octet-stream",
    size: measureContentSize(attachment.content),
    inline: attachment.disposition === "inline",
    cid: attachment.contentId ?? null,
  }));

  const sentAt = parsed.date ? new Date(parsed.date) : input.internalDate;

  return {
    providerMessageId: `${input.folderId}:${input.uid}`,
    internetMessageId: parsed.messageId ?? null,
    subject: parsed.subject ?? "",
    snippet,
    fromJson: recipientsToJson(parsed.from),
    toJson: recipientsToJson(parsed.to),
    ccJson: recipientsToJson(parsed.cc),
    bodyHtml: parsed.html ?? "",
    bodyText: parsed.text ?? "",
    isRead: false,
    receivedAt: input.internalDate,
    sentAt,
    attachments,
  };
}
