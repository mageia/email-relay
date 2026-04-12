import { MICROSOFT_GRAPH_BASE_URL } from "./constants";

export function buildOutlookSubscriptionRequest(input: {
  notificationUrl: string;
  clientState: string;
  resource: string;
  expiresAt: Date;
}) {
  return {
    changeType: "created,updated",
    notificationUrl: input.notificationUrl,
    resource: input.resource,
    expirationDateTime: input.expiresAt.toISOString(),
    clientState: input.clientState,
  };
}

export async function createOutlookSubscription(
  accessToken: string,
  input: Parameters<typeof buildOutlookSubscriptionRequest>[0],
) {
  const response = await fetch(`${MICROSOFT_GRAPH_BASE_URL}/subscriptions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildOutlookSubscriptionRequest(input)),
  });

  if (!response.ok) {
    throw new Error(`Graph subscription failed: ${response.status}`);
  }

  return (await response.json()) as {
    id: string;
    expirationDateTime: string;
    resource: string;
  };
}
