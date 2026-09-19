import { Badge } from "@email-relay/ui/components/badge";
import { Button } from "@email-relay/ui/components/button";
import EmptyState from "@email-relay/ui/components/empty-state";
import ErrorState from "@email-relay/ui/components/error-state";
import PageHeader from "@email-relay/ui/components/page-header";
import {
  Panel,
  PanelActions,
  PanelDescription,
  PanelHeader,
  PanelTitle,
} from "@email-relay/ui/components/panel";
import { Skeleton } from "@email-relay/ui/components/skeleton";
import StatusBadge from "@email-relay/ui/components/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@email-relay/ui/components/table";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2Icon } from "lucide-react";
import { toast } from "sonner";

import AlertSummaryCards from "@/components/alert-summary-cards";
import BackfillPanel, {
  type GroupBackfillPayload,
  type MailboxBackfillPayload,
} from "@/components/backfill-panel";
import { client, orpc, queryClient } from "@/utils/orpc";

export const Route = createFileRoute("/_protected/operations")({
  component: OperationsPage,
});

/** Mirrors MAX_SYNC_ATTEMPTS in packages/mail/src/sync/retry.ts */
const MAX_SYNC_ATTEMPTS = 5;

type RetryJob = {
  id: string;
  mailboxAddress?: string | null;
  provider?: string | null;
  retryCount: number;
  errorCategory?: string | null;
  errorMessage?: string | null;
  nextAttemptAt?: string | Date | null;
};

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

  const triggerMailboxBackfill = async ({
    mailboxId,
    rangeStart,
    rangeEnd,
  }: MailboxBackfillPayload) => {
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

  const jobs = (retryJobs.data ?? []) as RetryJob[];

  return (
    <>
      <PageHeader
        title="同步运维"
        description="汇总告警并提供单邮箱或整分组的历史补拉入口。"
      />

      {summary.isPending ? (
        <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-[5.25rem]" />
          ))}
        </div>
      ) : summary.data ? (
        <AlertSummaryCards summary={summary.data} />
      ) : null}

      <BackfillPanel
        mailboxes={mailboxes.data ?? []}
        groups={groups.data ?? []}
        isLoading={mailboxes.isPending || groups.isPending}
        onMailboxBackfill={triggerMailboxBackfill}
        onGroupBackfill={triggerGroupBackfill}
      />

      <Panel>
        <PanelHeader>
          <div className="min-w-0">
            <PanelTitle>待重试任务</PanelTitle>
            <PanelDescription>
              已进入 retry-scheduled 的补拉任务，可手动立即重排。
            </PanelDescription>
          </div>
          <PanelActions>
            {jobs.length > 0 ? <Badge tone="neutral">{jobs.length} 个</Badge> : null}
          </PanelActions>
        </PanelHeader>

        {retryJobs.isPending ? (
          <div className="flex flex-col gap-2 p-3.5">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-9" />
            ))}
          </div>
        ) : retryJobs.isError ? (
          <ErrorState
            description="无法获取待重试任务列表。"
            error={retryJobs.error}
            onRetry={() => retryJobs.refetch()}
          />
        ) : jobs.length === 0 ? (
          <EmptyState
            icon={<CheckCircle2Icon />}
            title="当前没有待重试任务。"
            description="所有同步任务都已完成，或尚未产生需要重试的失败。"
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>邮箱</TableHead>
                <TableHead className="w-24">Provider</TableHead>
                <TableHead className="w-20">重试</TableHead>
                <TableHead className="w-32">错误类别</TableHead>
                <TableHead className="w-44">下次自动重试</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.map((job) => {
                const exhausted = job.retryCount >= MAX_SYNC_ATTEMPTS;

                return (
                  <TableRow key={job.id}>
                    <TableCell>
                      <div className="font-medium">{job.mailboxAddress ?? job.id}</div>
                      {job.errorMessage ? (
                        <div className="mt-0.5 font-mono text-[0.6875rem] break-all text-muted-foreground">
                          {job.errorMessage}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Badge tone="outline">{job.provider ?? "unknown"}</Badge>
                    </TableCell>
                    <TableCell className="tabular-nums">
                      <span className={exhausted ? "text-destructive" : undefined}>
                        {job.retryCount} / {MAX_SYNC_ATTEMPTS}
                      </span>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={job.errorCategory ?? "temporary"} />
                    </TableCell>
                    <TableCell>
                      {exhausted ? (
                        <span className="text-xs text-muted-foreground">已放弃</span>
                      ) : job.nextAttemptAt ? (
                        <time
                          dateTime={new Date(job.nextAttemptAt).toISOString()}
                          className="text-xs text-muted-foreground"
                        >
                          {new Date(job.nextAttemptAt).toLocaleString("zh-CN", { hour12: false })}
                        </time>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={retryJob.isPending || exhausted}
                        onClick={() => {
                          retryJob.mutate(job.id, {
                            onSuccess: () => toast.success("已手动重新排队"),
                            onError: (error) =>
                              toast.error(`手动重试失败：${(error as Error).message}`),
                          });
                        }}
                      >
                        立即重试
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Panel>
    </>
  );
}
