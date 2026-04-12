import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import GmailLabelSelector from "@/components/gmail-label-selector";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_protected/mailboxes/$mailboxId")({
  component: MailboxDetailPage,
});

function MailboxDetailPage() {
  const { mailboxId } = Route.useParams();
  const mailboxes = useQuery(orpc.mailboxes.list.queryOptions());
  const mailbox = mailboxes.data?.find((entry: { id: string }) => entry.id === mailboxId);

  const selectedLabels =
    mailbox && mailbox.provider === "gmail"
      ? JSON.parse((mailbox.selectedFoldersJson as string | undefined) ?? "[]").map((labelId: string) => ({
          id: labelId,
          name: labelId,
          kind: "system",
        }))
      : [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">{mailbox?.address ?? "Mailbox"}</h1>
        <p className="text-sm text-muted-foreground">
          {mailbox ? `${mailbox.provider} · ${mailbox.status}` : "正在加载邮箱信息..."}
        </p>
      </div>
      <GmailLabelSelector labels={selectedLabels} />
    </div>
  );
}
