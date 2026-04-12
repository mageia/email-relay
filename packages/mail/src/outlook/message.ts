function mapRecipients(
  value: Array<{ emailAddress?: { address?: string; name?: string } }> | undefined,
) {
  return JSON.stringify(
    (value ?? []).map((recipient) => ({
      address: recipient.emailAddress?.address ?? "",
      name: recipient.emailAddress?.name ?? "",
    })),
  );
}

export function normalizeOutlookMessage(message: any) {
  return {
    providerMessageId: message.id,
    internetMessageId: message.internetMessageId ?? null,
    subject: message.subject ?? "",
    snippet: message.bodyPreview ?? "",
    fromJson: mapRecipients(message.from ? [message.from] : []),
    toJson: mapRecipients(message.toRecipients),
    ccJson: mapRecipients(message.ccRecipients),
    bodyHtml:
      message.body?.contentType?.toLowerCase() === "html" ? (message.body.content ?? "") : "",
    bodyText:
      message.body?.contentType?.toLowerCase() === "text"
        ? (message.body.content ?? "")
        : (message.bodyPreview ?? ""),
    isRead: Boolean(message.isRead),
    receivedAt: new Date(message.receivedDateTime),
    sentAt: message.sentDateTime ? new Date(message.sentDateTime) : null,
    attachments: [] as Array<never>,
  };
}
