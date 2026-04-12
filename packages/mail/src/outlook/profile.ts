import { MICROSOFT_GRAPH_BASE_URL } from "./constants";

export async function getOutlookProfile(accessToken: string) {
  const response = await fetch(
    `${MICROSOFT_GRAPH_BASE_URL}/me?$select=id,mail,userPrincipalName,displayName`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!response.ok) {
    throw new Error(`Outlook profile fetch failed: ${response.status}`);
  }

  const body = (await response.json()) as {
    mail: string | null;
    userPrincipalName: string;
    displayName: string;
  };

  return {
    emailAddress: body.mail ?? body.userPrincipalName,
    displayName: body.displayName,
  };
}
