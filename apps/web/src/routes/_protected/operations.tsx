import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import AlertSummaryCards from "@/components/alert-summary-cards";
import OperationsGroupBackfillSection, { type GroupBackfillPayload } from "@/components/operations-group-backfill";
import OperationsMailboxBackfillSection, { type MailboxBackfillPayload } from "@/components/operations-mailbox-backfill";
import { client, orpc, queryClient } from "@/utils/orpc";
import { toast } from "sonner";

export const Route = createFileRoute("/_protected/operations")({
  component: OperationsPage,
});

function OperationsPage() {
  const summary = useQuery(orpc.alerts.summary.queryOptions());
  const mailboxes = useQuery(orpc.mailboxes.list.queryOptions());
  const groups = useQuery(orpc.groups.list.queryOptions());
  const retryJobs = useQuery(orpc.operations.listRetryJobs.queryOptions());

  const formatDate = (value: string) => new Date(`${value}T00:00:00.000Z`).toISOString();

  const retryJob = useMutation({
    mutationFn: async (jobId: string) => client.operations.retryJob({ jobId }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: orpc.operations.listRetryJobs.queryKey() });
      await queryClient.invalidateQueries({ queryKey: orpc.alerts.summary.queryKey() });
    },
  });

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
          <h2 className="text-xl font-semibold">待重试任务</h2>
          <p className="text-sm text-muted-foreground">对已经进入 retry-scheduled 的补拉任务可手动立即重排队。</p>
        </div>
        {retryJobs.isLoading ? (
          <p className="text-sm text-muted-foreground">重试任务加载中...</p>
        ) : retryJobs.data && retryJobs.data.length > 0 ? (
          <ul className="space-y-3">
            {retryJobs.data.map((job: { id: string; mailboxAddress?: string | null; provider?: string | null; retryCount: number; errorCategory?: string | null; errorMessage?: string | null; nextAttemptAt?: string | Date | null }) => (
              <li key={job.id} className="rounded-lg border p-3">
                <div className="font-medium">{job.mailboxAddress ?? job.id}</div>
                <div className="text-sm text-muted-foreground">
                  {(job.provider ?? "unknown")} · 已重试 {job.retryCount} 次 · {job.errorCategory ?? "temporary"}
                </div>
                {job.errorMessage ? <div className="mt-1 text-sm text-muted-foreground">{job.errorMessage}</div> : null}
                {job.nextAttemptAt ? (
                  <div className="mt-1 text-xs text-muted-foreground">
                    下次自动重试：{new Date(job.nextAttemptAt).toLocaleString("zh-CN", { hour12: false })}
                  </div>
                ) : null}
                <button
                  className="mt-3 text-sm text-blue-600 hover:underline disabled:text-muted-foreground"
                  disabled={retryJob.isPending}
                  onClick={() => {
                    retryJob.mutate(job.id, {
                      onSuccess: () => {
                        toast.success("已手动重新排队");
                      },
                      onError: (error) => {
                        toast.error(`手动重试失败：${(error as Error).message}`);
                      },
                    });
                  }}
                >
                  立即重试
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">当前没有待重试任务。</p>
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
