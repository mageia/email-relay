export default function InboxSidebar({
  groups,
  mailboxes,
}: {
  groups: Array<{ id: string; name: string }>;
  mailboxes: Array<{ id: string; address: string; provider: string }>;
}) {
  return (
    <div className="space-y-6 rounded-xl border p-4">
      <section>
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">Groups</h2>
        <ul className="space-y-1 text-sm">
          {groups.length === 0 ? <li className="text-muted-foreground">暂无分组</li> : null}
          {groups.map((group) => (
            <li key={group.id}>{group.name}</li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">Mailboxes</h2>
        <ul className="space-y-1 text-sm">
          {mailboxes.length === 0 ? <li className="text-muted-foreground">暂无已接入邮箱</li> : null}
          {mailboxes.map((mailbox) => (
            <li key={mailbox.id}>
              {mailbox.address}
              <span className="ml-2 text-xs text-muted-foreground">{mailbox.provider}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
