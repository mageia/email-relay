export function normalizeImapFolders(folders: string[]) {
  return folders.map((folder) => ({
    id: folder,
    name: folder,
    kind: folder.toUpperCase() === "INBOX" ? "system" : "custom",
    selected: folder.toUpperCase() === "INBOX",
  }));
}
