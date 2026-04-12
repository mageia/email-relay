import { MICROSOFT_GRAPH_BASE_URL } from "./constants";

export function mapOutlookFolders(
  folders: Array<{ id: string; displayName: string; wellKnownName?: string }>,
) {
  return folders.map((folder) => ({
    id: folder.id,
    name: folder.displayName,
    kind: folder.wellKnownName ? "system" : "custom",
    selected: folder.wellKnownName === "inbox",
  }));
}

export async function listOutlookFolders(accessToken: string) {
  const response = await fetch(
    `${MICROSOFT_GRAPH_BASE_URL}/me/mailFolders?$top=100&$select=id,displayName,wellKnownName`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!response.ok) {
    throw new Error(`Outlook folders fetch failed: ${response.status}`);
  }

  const body = (await response.json()) as {
    value: Array<{ id: string; displayName: string; wellKnownName?: string }>;
  };

  return mapOutlookFolders(body.value);
}
