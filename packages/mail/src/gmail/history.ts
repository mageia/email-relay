export function decodeGmailPushBody(body: { message?: { data?: string } }) {
  const encoded = body.message?.data;
  if (!encoded) {
    throw new Error("Missing Gmail Pub/Sub message data");
  }

  return JSON.parse(Buffer.from(encoded, "base64").toString("utf8")) as {
    emailAddress: string;
    historyId: string;
  };
}

export async function getGmailHistoryPage(input: {
  accessToken: string;
  startHistoryId: string;
  pageToken?: string;
  labelId?: string;
}) {
  const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/history");
  url.searchParams.set("startHistoryId", input.startHistoryId);
  url.searchParams.set("historyTypes", "messageAdded");
  if (input.pageToken) {
    url.searchParams.set("pageToken", input.pageToken);
  }
  if (input.labelId) {
    url.searchParams.set("labelId", input.labelId);
  }

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Gmail history.list failed: ${response.status}`);
  }

  return (await response.json()) as {
    history?: Array<{
      messagesAdded?: Array<{ message?: { id?: string } }>;
      labelsAdded?: Array<{ message?: { id?: string } }>;
      labelsRemoved?: Array<{ message?: { id?: string } }>;
    }>;
    nextPageToken?: string;
    historyId?: string;
  };
}

export function extractHistoryMessageIds(historyPage: {
  history?: Array<{
    messagesAdded?: Array<{ message?: { id?: string } }>;
    labelsAdded?: Array<{ message?: { id?: string } }>;
    labelsRemoved?: Array<{ message?: { id?: string } }>;
  }>;
}) {
  const ids = new Set<string>();

  for (const item of historyPage.history ?? []) {
    for (const record of item.messagesAdded ?? []) {
      if (record.message?.id) ids.add(record.message.id);
    }
    for (const record of item.labelsAdded ?? []) {
      if (record.message?.id) ids.add(record.message.id);
    }
    for (const record of item.labelsRemoved ?? []) {
      if (record.message?.id) ids.add(record.message.id);
    }
  }

  return [...ids];
}
