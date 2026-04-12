import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_protected/mailboxes")({
  component: MailboxesPage,
});

function MailboxesPage() {
  const filters = useQuery(orpc.inbox.listFilters.queryOptions());

  return (
    <div className="rounded-xl border p-4">
      <h1 className="mb-4 text-2xl font-semibold">邮箱</h1>
      {filters.data?.mailboxes?.length ? (
        <ul className="space-y-3">
          {filters.data.mailboxes.map(
            (mailbox: { id: string; address: string; provider: string }) => (
              <li key={mailbox.id} className="rounded-lg border p-3">
                <div className="font-medium">{mailbox.address}</div>
                <div className="text-sm text-muted-foreground">{mailbox.provider}</div>
              </li>
            ),
          )}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">还没有已接入邮箱。后续会在这里接入 Gmail / Outlook / IMAP。</p>
      )}
    </div>
  );
}
