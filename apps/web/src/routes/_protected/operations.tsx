import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import AlertSummaryCards from "@/components/alert-summary-cards";
import OperationsGroupBackfillSection, { type GroupBackfillPayload } from "@/components/operations-group-backfill";
import OperationsMailboxBackfillSection, { type MailboxBackfillPayload } from "@/components/operations-mailbox-backfill";
import { client, orpc } from "@/utils/orpc";
import { toast } from "sonner";

export const Route = createFileRoute("/_protected/operations")({
  component: OperationsPage,
});

function OperationsPage() {
  const summary = useQuery(orpc.alerts.summary.queryOptions());
  const mailboxes = useQuery(orpc.mailboxes.list.queryOptions());
  const groups = useQuery(orpc.groups.list.queryOptions());

  const formatDate = (value: string) => new Date(`${value}T00:00:00.000Z`).toISOString();

  const triggerMailboxBackfill = async ({ mailboxId, rangeStart, rangeEnd }: MailboxBackfillPayload) => {
    try {
      await client.operations.triggerMailboxBackfill({
        mailboxId,
        rangeStart: formatDate(rangeStart),
        rangeEnd: formatDate(rangeEnd),
      });
      toast.success("已排入邮箱补拉任务");
    } catch (error) {
      toast.error(`邮箱补拉失败：${(error as Error).message}`);
      throw error;
    }
  };

  const triggerGroupBackfill = async ({ groupId, rangeStart, rangeEnd }: GroupBackfillPayload) => {
    try {
      await client.operations.triggerGroupBackfill({
        groupId,
        rangeStart: formatDate(rangeStart),
        rangeEnd: formatDate(rangeEnd),
      });
      toast.success("已排入分组补拉任务");
    } catch (error) {
      toast.error(`分组补拉失败：${(error as Error).message}`);
      throw error;
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border p-4 space-y-3">
        <div>
          <h1 className="text-2xl font-semibold">Sync Operations</h1>
          <p className="text-sm text-muted-foreground">
            这里汇总所有告警，并提供单个邮箱或整个分组的历史补拉入口。
          </p>
        </div>
        {summary.data ? (
          <AlertSummaryCards summary={summary.data} />
        ) : (
          <p className="text-sm text-muted-foreground">概览正在加载...</p>
        )}
      </div>

      <section className="rounded-xl border p-4 space-y-3">
        <div>
          <h2 className="text-xl font-semibold">按邮箱补拉</h2>
          <p className="text-sm text-muted-foreground">
            选择一个邮箱，设定日期范围即可把这段时间重新入队同步。
          </p>
        </div>
        {mailboxes.isLoading ? (
          <p className="text-sm text-muted-foreground">邮箱数据加载中...</p>
        ) : (
          <OperationsMailboxBackfillSection
            mailboxes={mailboxes.data ?? []}
            onBackfill={triggerMailboxBackfill}
          />
        )}
      </section>

      <section className="rounded-xl border p-4 space-y-3">
        <div>
          <h2 className="text-xl font-semibold">按分组补拉</h2>
          <p className="text-sm text-muted-foreground">
            使用已有分组在一个表单里为多个邮箱批量触发历史补拉。
          </p>
        </div>
        {groups.isLoading ? (
          <p className="text-sm text-muted-foreground">分组数据加载中...</p>
        ) : (
          <OperationsGroupBackfillSection
            groups={groups.data ?? []}
            onBackfill={triggerGroupBackfill}
          />
        )}
      </section>
    </div>
  );
}
