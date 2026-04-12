export async function startGmailWatch(
  accessToken: string,
  topicName: string,
  labelIds: string[],
) {
  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/watch", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      topicName,
      labelIds,
      labelFilterBehavior: "include",
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to start Gmail watch: ${response.status}`);
  }

  return (await response.json()) as {
    historyId: string;
    expiration: string;
  };
}
