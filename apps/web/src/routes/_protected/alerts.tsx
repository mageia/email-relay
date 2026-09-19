import { Badge } from "@email-relay/ui/components/badge";
import { Button } from "@email-relay/ui/components/button";
import EmptyState from "@email-relay/ui/components/empty-state";
import ErrorState from "@email-relay/ui/components/error-state";
import PageHeader from "@email-relay/ui/components/page-header";
import { Panel } from "@email-relay/ui/components/panel";
import { Skeleton } from "@email-relay/ui/components/skeleton";
import StatusBadge from "@email-relay/ui/components/status-badge";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { BellOffIcon } from "lucide-react";
import { toast } from "sonner";

import { client, orpc, queryClient } from "@/utils/orpc";

export const Route = createFileRoute("/_protected/alerts")({
  component: AlertsPage,
});

type Alert = {
  id: string;
  title: string;
  detail: string;
  severity: string;
  status: string;
  type?: string | null;
  createdAt?: string | Date | null;
};

const SEVERITY_LABEL: Record<string, string> = {
  high: "高危",
  medium: "中危",
  low: "低危",
};

const SEVERITY_RULE: Record<string, string> = {
  high: "bg-destructive",
  medium: "bg-warning",
  low: "bg-border-strong",
};

function AlertsPage() {
  const alerts = useQuery(orpc.alerts.list.queryOptions());
  const resolveAlert = useMutation({
    mutationFn: async (alertId: string) => client.alerts.resolve({ alertId }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: orpc.alerts.list.queryKey() });
      await queryClient.invalidateQueries({ queryKey: orpc.alerts.summary.queryKey() });
    },
  });

  const rows = (alerts.data ?? []) as Alert[];
  const openCount = rows.filter((alert) => alert.status !== "resolved").length;

  return (
    <>
      <PageHeader
        title="告警"
        description="同步过程中产生的异常，处理后标记为已解决。"
        actions={
          rows.length > 0 ? (
            <Badge tone={openCount > 0 ? "warning" : "success"} dot={openCount > 0}>
              {openCount > 0 ? `${openCount} 个未解决` : "全部已解决"}
            </Badge>
          ) : null
        }
      />

      <Panel>
        {alerts.isPending ? (
          <div className="flex flex-col gap-2 p-3.5">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-16" />
            ))}
          </div>
        ) : alerts.isError ? (
          <ErrorState
            description="无法获取告警列表。"
            error={alerts.error}
            onRetry={() => alerts.refetch()}
          />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<BellOffIcon />}
            title="当前没有告警。"
            description="同步任务出现认证失效、限流或长时间未成功时，会在这里生成告警。"
          />
        ) : (
          <ul className="flex flex-col">
            {rows.map((alert) => {
              const severity = alert.severity.toLowerCase();
              const resolved = alert.status === "resolved";

              return (
                <li
                  key={alert.id}
                  className="flex items-start gap-3 border-b border-hairline px-3.5 py-3 last:border-b-0"
                >
                  <span
                    aria-hidden="true"
                    className={`w-0.5 shrink-0 self-stretch rounded-sm ${
                      resolved ? "bg-border" : (SEVERITY_RULE[severity] ?? "bg-border-strong")
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-[0.8125rem] font-medium">
                      <span className={resolved ? "text-muted-foreground" : undefined}>
                        {alert.title}
                      </span>
                      <StatusBadge
                        status={severity}
                        label={SEVERITY_LABEL[severity] ?? alert.severity}
                      />
                      {alert.type ? <Badge tone="outline">{alert.type}</Badge> : null}
                      {resolved ? <StatusBadge status="resolved" label="已解决" /> : null}
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {alert.detail}
                    </p>
                    {alert.createdAt ? (
                      <time
                        dateTime={new Date(alert.createdAt).toISOString()}
                        className="mt-1.5 block font-mono text-[0.6875rem] text-muted-foreground"
                      >
                        {new Date(alert.createdAt).toLocaleString("zh-CN", { hour12: false })}
                      </time>
                    ) : null}
                  </div>
                  {!resolved ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      disabled={resolveAlert.isPending}
                      onClick={() => {
                        resolveAlert.mutate(alert.id, {
                          onSuccess: () => toast.success("已标记为已解决"),
                          onError: (error) =>
                            toast.error(`操作失败：${(error as Error).message}`),
                        });
                      }}
                    >
                      Resolve
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </>
  );
}
