import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import AlertSummaryCards from "@/components/alert-summary-cards";
import InboxEmptyState from "@/components/inbox-empty-state";
import InboxSidebar from "@/components/inbox-sidebar";
import InboxSearchBar from "@/components/inbox-search-bar";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_protected/inbox")({
  component: InboxPage,
});

function InboxPage() {
  const [search, setSearch] = useState("");
  const [sidebarFilters, setSidebarFilters] = useState<{
    provider?: string;
    groupId?: string;
    mailboxId?: string;
    status?: string;
  }>({});
  const filters = useQuery(orpc.inbox.listFilters.queryOptions());
  const messages = useQuery(
    orpc.inbox.listMessages.queryOptions({
      input: {
        limit: 20,
        search,
        provider: sidebarFilters.provider,
        groupId: sidebarFilters.groupId,
        mailboxId: sidebarFilters.mailboxId,
        status: sidebarFilters.status,
      },
    }),
  );
  const summary = useQuery(orpc.alerts.summary.queryOptions());

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
      <InboxSidebar
        groups={filters.data?.groups ?? []}
        mailboxes={filters.data?.mailboxes ?? []}
        value={sidebarFilters}
        onChange={(patch) => {
          setSidebarFilters((current) => ({ ...current, ...patch }));
        }}
      />
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold">统一收件箱</h1>
          <p className="text-sm text-muted-foreground">这里会显示所有已同步邮件的聚合视图。</p>
        </div>
        {summary.data ? <AlertSummaryCards summary={summary.data} /> : null}
        <InboxSearchBar value={search} onChange={setSearch} />
        {messages.data && messages.data.length > 0 ? (
          <div className="rounded-xl border">
            {messages.data.map((message: { id: string; subject: string; mailboxAddress: string }) => (
              <div key={message.id} className="border-b px-4 py-3 last:border-b-0">
                <div className="font-medium">{message.subject || "(无主题)"}</div>
                <div className="text-sm text-muted-foreground">{message.mailboxAddress}</div>
              </div>
            ))}
          </div>
        ) : (
          <InboxEmptyState />
        )}
      </div>
    </div>
  );
}
