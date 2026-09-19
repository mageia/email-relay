import { MICROSOFT_GRAPH_BASE_URL } from "./constants";

const MESSAGE_SELECT =
  "id,subject,body,bodyPreview,from,toRecipients,ccRecipients,receivedDateTime,sentDateTime,isRead,internetMessageId";

export async function getOutlookDeltaPage(input: {
  accessToken: string;
  deltaLink?: string;
}) {
  const targetUrl = input.deltaLink
    ? input.deltaLink
    : `${MICROSOFT_GRAPH_BASE_URL}/me/messages/delta?$select=${MESSAGE_SELECT}&$top=50`;

  const response = await fetch(targetUrl, {
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      Prefer: 'outlook.body-content-type="html"',
    },
  });

  if (!response.ok) {
    throw new Error(`Outlook delta failed: ${response.status}`);
  }

  return (await response.json()) as {
    value: any[];
    "@odata.nextLink"?: string;
    "@odata.deltaLink"?: string;
  };
}

/**
 * Backfills cannot use the delta endpoint: delta only walks forward from a token
 * and has no date filter. This uses the plain messages endpoint with a
 * receivedDateTime filter so the admin-selected window is actually honoured.
 */
export async function getOutlookMessagesInRange(input: {
  accessToken: string;
  rangeStart: Date;
  rangeEnd: Date;
  nextLink?: string;
}) {
  let targetUrl: string;

  if (input.nextLink) {
    targetUrl = input.nextLink;
  } else {
    const url = new URL(`${MICROSOFT_GRAPH_BASE_URL}/me/messages`);
    url.searchParams.set("$select", MESSAGE_SELECT);
    url.searchParams.set("$top", "50");
    url.searchParams.set("$orderby", "receivedDateTime desc");
    // `rangeEnd` is midnight of the selected end date and that whole day should be
    // included, so the upper bound is exclusive at midnight of the following day.
    // This keeps Gmail, Outlook and IMAP windows identical for the same input.
    const endExclusive = new Date(input.rangeEnd.getTime() + 24 * 60 * 60 * 1000);
    url.searchParams.set(
      "$filter",
      `receivedDateTime ge ${input.rangeStart.toISOString()} and receivedDateTime lt ${endExclusive.toISOString()}`,
    );
    targetUrl = url.toString();
  }

  const response = await fetch(targetUrl, {
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      Prefer: 'outlook.body-content-type="html"',
    },
  });

  if (!response.ok) {
    throw new Error(`Outlook message range query failed: ${response.status}`);
  }

  return (await response.json()) as {
    value: any[];
    "@odata.nextLink"?: string;
  };
}
