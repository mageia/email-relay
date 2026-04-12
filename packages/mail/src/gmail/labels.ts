import { GMAIL_API_BASE_URL } from "./constants";

export async function listGoogleLabels(accessToken: string) {
  const response = await fetch(`${GMAIL_API_BASE_URL}/labels`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to list Gmail labels: ${response.status}`);
  }

  const body = (await response.json()) as {
    labels: Array<{ id: string; name: string; type: "system" | "user" }>;
  };

  return body.labels.map((label) => ({
    id: label.id,
    name: label.name,
    kind: label.type,
  }));
}
