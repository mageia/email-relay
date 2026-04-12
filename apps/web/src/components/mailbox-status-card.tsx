export default function MailboxStatusCard({
  mailbox,
}: {
  mailbox: { id: string; address: string; provider: string; status: string };
}) {
  return (
    <a href={`/mailboxes/${mailbox.id}`} className="block rounded-xl border p-4 hover:bg-muted/40">
      <div className="font-medium">{mailbox.address}</div>
      <div className="text-sm text-muted-foreground">
        {mailbox.provider} · {mailbox.status}
      </div>
    </a>
  );
}
