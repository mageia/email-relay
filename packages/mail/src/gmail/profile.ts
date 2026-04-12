import { GMAIL_API_BASE_URL } from "./constants";

export async function getGoogleProfile(accessToken: string) {
  const response = await fetch(`${GMAIL_API_BASE_URL}/profile`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to load Gmail profile: ${response.status}`);
  }

  return (await response.json()) as {
    emailAddress: string;
    historyId: string;
  };
}
