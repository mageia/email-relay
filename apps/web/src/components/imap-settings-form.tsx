export default function ImapSettingsForm({
  folders,
}: {
  folders: Array<{ id: string; name: string; kind: string }>;
}) {
  return (
    <div className="rounded-xl border p-4">
      <h2 className="mb-3 text-lg font-medium">IMAP Folders</h2>
      <ul className="space-y-2 text-sm">
        {folders.length === 0 ? <li className="text-muted-foreground">暂无已选择文件夹</li> : null}
        {folders.map((folder) => (
          <li key={folder.id}>
            {folder.name}
            <span className="ml-2 text-xs text-muted-foreground">{folder.kind}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
