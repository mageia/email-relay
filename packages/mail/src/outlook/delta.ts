import { MICROSOFT_GRAPH_BASE_URL } from "./constants";

export async function getOutlookDeltaPage(input: {
  accessToken: string;
  deltaLink?: string;
}) {
  const targetUrl = input.deltaLink
    ? input.deltaLink
    : `${MICROSOFT_GRAPH_BASE_URL}/me/messages/delta?$select=id,subject,body,bodyPreview,from,toRecipients,ccRecipients,receivedDateTime,sentDateTime,isRead,internetMessageId&$top=50`;

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
