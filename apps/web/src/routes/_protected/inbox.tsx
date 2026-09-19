import { Badge } from "@email-relay/ui/components/badge";
import { Button } from "@email-relay/ui/components/button";
import EmptyState from "@email-relay/ui/components/empty-state";
import ErrorState from "@email-relay/ui/components/error-state";
import PageHeader from "@email-relay/ui/components/page-header";
import { Panel, PanelActions, PanelHeader } from "@email-relay/ui/components/panel";
import { Skeleton } from "@email-relay/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { InboxIcon, RefreshCwIcon } from "lucide-react";
import { useState } from "react";

import AlertSummaryCards from "@/components/alert-summary-cards";
import InboxSearchBar from "@/components/inbox-search-bar";
import InboxSidebar from "@/components/inbox-sidebar";
import ProviderGlyph from "@/components/provider-glyph";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_protected/inbox")({
  component: InboxPage,
});

type InboxMessage = {
  id: string;
  subject: string;
  mailboxAddress: string;
  provider?: string | null;
  snippet?: string | null;
  receivedAt?: string | Date | null;
  isRead?: boolean | null;
};

/** Short relative-ish stamp: time for today, date beyond that. */
function formatStamp(value?: string | Date | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) {
    return date.toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "昨天";

  return date.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
}

function MessageSkeleton() {
  return (
    <div className="flex flex-col">
      {Array.from({ length: 8 }).map((_, index) => (
        <div
          key={index}
          className="grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-hairline px-3.5 py-2.5 last:border-b-0"
        >
          <Skeleton className="size-5" />
          <div className="min-w-0">
            <Skeleton className="h-2.5" style={{ width: `${45 + ((index * 13) % 35)}%` }} />
            <Skeleton className="mt-1.5 h-2" style={{ width: `${30 + ((index * 7) % 25)}%` }} />
          </div>
          <Skeleton className="h-2 w-8" />
        </div>
      ))}
    </div>
  );
}

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

  const mailboxes = filters.data?.mailboxes ?? [];
  const rows = (messages.data ?? []) as InboxMessage[];
  const hasActiveFilter =
    Boolean(search) ||
    Object.values(sidebarFilters).some((value) => value !== undefined && value !== "");

  return (
    <>
      <PageHeader
        title="统一收件箱"
        description={
          mailboxes.length > 0
            ? `所有已同步邮件的聚合视图，共 ${mailboxes.length} 个邮箱`
            : "所有已同步邮件的聚合视图"
        }
        actions={
          <Button
            variant="outline"
            onClick={() => {
              messages.refetch();
              summary.refetch();
            }}
            disabled={messages.isFetching}
          >
            <RefreshCwIcon aria-hidden="true" className={messages.isFetching ? "animate-spin" : undefined} />
            刷新
          </Button>
        }
      />

      {/* A failed summary must not block the message list, so it degrades to
          skeletons rather than an error state. */}
      {summary.isPending ? (
        <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-[5.25rem]" />
          ))}
        </div>
      ) : summary.data ? (
        <AlertSummaryCards summary={summary.data} />
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
        <InboxSidebar
          groups={filters.data?.groups ?? []}
          mailboxes={mailboxes}
          value={sidebarFilters}
          isLoading={filters.isPending}
          onChange={(patch) => setSidebarFilters((current) => ({ ...current, ...patch }))}
          onReset={() => {
            setSidebarFilters({});
            setSearch("");
          }}
        />

        <Panel className="min-w-0">
          <PanelHeader>
            <div className="max-w-80 flex-1">
              <InboxSearchBar value={search} onChange={setSearch} />
            </div>
            <PanelActions>
              {!messages.isPending && !messages.isError ? (
                <span className="text-[0.6875rem] text-muted-foreground tabular-nums">
                  {rows.length} 封
                </span>
              ) : null}
            </PanelActions>
          </PanelHeader>

          {messages.isPending ? (
            <MessageSkeleton />
          ) : messages.isError ? (
            <ErrorState
              description="无法获取邮件列表。"
              error={messages.error}
              onRetry={() => messages.refetch()}
            />
          ) : rows.length === 0 ? (
            <EmptyState
              icon={<InboxIcon />}
              title={hasActiveFilter ? "没有匹配的邮件" : "还没有同步到邮件"}
              description={
                hasActiveFilter
                  ? "当前筛选条件下没有结果，试着放宽条件或清除筛选。"
                  : "接入邮箱后，同步任务会在几分钟内把邮件拉取到这里。也可以手动触发一次历史补拉。"
              }
              action={
                hasActiveFilter ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSidebarFilters({});
                      setSearch("");
                    }}
                  >
                    清除筛选
                  </Button>
                ) : null
              }
            />
          ) : (
            <ul className="flex flex-col">
              {rows.map((message) => {
                const unread = message.isRead === false;

                return (
                  <li
                    key={message.id}
                    className="relative grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-hairline px-3.5 py-2.5 last:border-b-0 hover:bg-muted/60"
                  >
                    {unread ? (
                      <span
                        aria-hidden="true"
                        className="absolute inset-y-0 left-0 w-0.5 bg-brand"
                      />
                    ) : null}
                    <ProviderGlyph provider={message.provider} />
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className={
                            message.subject
                              ? `truncate text-[0.8125rem] ${unread ? "font-semibold" : ""}`
                              : "truncate text-[0.8125rem] text-muted-foreground italic"
                          }
                        >
                          {message.subject || "(无主题)"}
                        </span>
                        {unread ? <Badge tone="brand">未读</Badge> : null}
                      </div>
                      <div className="mt-0.5 truncate text-[0.6875rem] text-muted-foreground">
                        {message.mailboxAddress}
                        {message.snippet ? ` · ${message.snippet}` : ""}
                      </div>
                    </div>
                    {message.receivedAt ? (
                      <time
                        dateTime={new Date(message.receivedAt).toISOString()}
                        className="shrink-0 text-[0.6875rem] text-muted-foreground tabular-nums"
                      >
                        {formatStamp(message.receivedAt)}
                      </time>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
