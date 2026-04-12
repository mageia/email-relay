import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import ConnectGmailButton from "@/components/connect-gmail-button";
import ConnectOutlookButton from "@/components/connect-outlook-button";
import MailboxStatusCard from "@/components/mailbox-status-card";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_protected/mailboxes")({
  component: MailboxesPage,
});

function MailboxesPage() {
  const mailboxes = useQuery(orpc.mailboxes.list.queryOptions());

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">邮箱</h1>
          <p className="text-sm text-muted-foreground">先接入 Gmail / Outlook，后续再补 IMAP。</p>
        </div>
        <div className="flex gap-3">
          <ConnectGmailButton />
          <ConnectOutlookButton />
        </div>
      </div>
      <div className="grid gap-4">
        {(mailboxes.data ?? []).map(
          (mailbox: { id: string; address: string; provider: string; status: string }) => (
            <MailboxStatusCard key={mailbox.id} mailbox={mailbox} />
          ),
        )}
        {mailboxes.data?.length === 0 ? (
          <p className="text-sm text-muted-foreground">还没有已接入邮箱。</p>
        ) : null}
      </div>
    </div>
  );
}
