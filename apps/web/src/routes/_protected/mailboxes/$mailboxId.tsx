import { Button } from "@email-relay/ui/components/button";
import ErrorState from "@email-relay/ui/components/error-state";
import PageHeader from "@email-relay/ui/components/page-header";
import {
  Panel,
  PanelBody,
  PanelDescription,
  PanelHeader,
  PanelTitle,
} from "@email-relay/ui/components/panel";
import { Skeleton } from "@email-relay/ui/components/skeleton";
import StatusBadge from "@email-relay/ui/components/status-badge";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ChevronLeftIcon } from "lucide-react";
import { toast } from "sonner";

import BackfillForm from "@/components/backfill-form";
import GmailLabelSelector from "@/components/gmail-label-selector";
import ImapSettingsForm from "@/components/imap-settings-form";
import ProviderGlyph from "@/components/provider-glyph";
import { client, orpc, queryClient } from "@/utils/orpc";

export const Route = createFileRoute("/_protected/mailboxes/$mailboxId")({
  component: MailboxDetailPage,
});

function MailboxDetailPage() {
  const { mailboxId } = Route.useParams();
  const mailboxes = useQuery(orpc.mailboxes.list.queryOptions());
  const mailbox = mailboxes.data?.find((entry: { id: string }) => entry.id === mailboxId);
  const folderChoices = useQuery(
    orpc.mailboxes.getFolderChoices.queryOptions({ input: { mailboxId } }),
  );
  const imapSettings = useQuery(
    orpc.mailboxes.getImapSettings.queryOptions({ input: { mailboxId } }),
  );
  const saveFolders = useMutation({
    mutationFn: async (labels: Array<{ id: string; name: string; kind: string }>) =>
      client.mailboxes.updateSelectedFolders({ mailboxId, labels }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: orpc.mailboxes.list.queryKey() });
      await queryClient.invalidateQueries({
        queryKey: orpc.mailboxes.getFolderChoices.queryKey({ input: { mailboxId } }),
      });
      toast.success("已更新同步标签/文件夹");
    },
  });

  const pickerTitle = mailbox?.provider === "outlook" ? "同步文件夹" : "同步标签";

  if (mailboxes.isError) {
    return (
      <Panel>
        <ErrorState
          description="无法获取邮箱信息。"
          error={mailboxes.error}
          onRetry={() => mailboxes.refetch()}
        />
      </Panel>
    );
  }

  return (
    <>
      <Link
        to="/mailboxes"
        className="inline-flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ChevronLeftIcon aria-hidden="true" className="size-3" />
        返回邮箱列表
      </Link>

      {mailboxes.isPending ? (
        <Skeleton className="h-10 w-72" />
      ) : (
        <PageHeader
          title={
            <>
              <ProviderGlyph provider={mailbox?.provider} className="size-6 text-[0.625rem]" />
              {mailbox?.address ?? "未知邮箱"}
              {mailbox ? <StatusBadge status={mailbox.status} /> : null}
            </>
          }
          description={mailbox ? mailbox.provider : "该邮箱不存在或已被移除。"}
        />
      )}

      {mailbox ? (
        <>
          <Panel>
            <PanelHeader>
              <div className="min-w-0">
                <PanelTitle>历史补拉</PanelTitle>
                <PanelDescription>为该邮箱重新同步指定日期范围。</PanelDescription>
              </div>
            </PanelHeader>
            <PanelBody>
              <BackfillForm
                idPrefix="detail-"
                isSubmitting={false}
                onSubmit={async ({ rangeStart, rangeEnd }) => {
                  try {
                    await client.operations.triggerMailboxBackfill({
                      mailboxId: mailbox.id,
                      rangeStart: new Date(`${rangeStart}T00:00:00.000Z`).toISOString(),
                      rangeEnd: new Date(`${rangeEnd}T00:00:00.000Z`).toISOString(),
                    });
                    toast.success("已排入邮箱补拉任务");
                  } catch (error) {
                    toast.error(`邮箱补拉失败：${(error as Error).message}`);
                    throw error;
                  }
                }}
              />
            </PanelBody>
          </Panel>

          {folderChoices.isPending ? (
            <Panel>
              <PanelBody className="flex flex-col gap-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-7" />
                <Skeleton className="h-7" />
              </PanelBody>
            </Panel>
          ) : folderChoices.isError ? (
            <Panel>
              <ErrorState
                description="无法获取可选标签或文件夹。"
                error={folderChoices.error}
                onRetry={() => folderChoices.refetch()}
              />
            </Panel>
          ) : mailbox.provider === "imap" && imapSettings.data ? (
            <ImapSettingsForm
              settings={imapSettings.data}
              folders={folderChoices.data ?? []}
              isSaving={saveFolders.isPending}
              onSave={async (value) => {
                await client.mailboxes.updateImapSettings({
                  mailboxId,
                  username: value.username,
                  host: value.host,
                  port: value.port,
                  secure: value.secure,
                  labels: value.folders,
                });
                await queryClient.invalidateQueries({
                  queryKey: orpc.mailboxes.getFolderChoices.queryKey({ input: { mailboxId } }),
                });
                await queryClient.invalidateQueries({
                  queryKey: orpc.mailboxes.getImapSettings.queryKey({ input: { mailboxId } }),
                });
                await queryClient.invalidateQueries({ queryKey: orpc.mailboxes.list.queryKey() });
                toast.success("已更新 IMAP 设置");
              }}
            />
          ) : (
            <GmailLabelSelector
              title={pickerTitle}
              labels={folderChoices.data ?? []}
              isSaving={saveFolders.isPending}
              onSave={async (labels) => {
                await saveFolders.mutateAsync(labels);
              }}
            />
          )}
        </>
      ) : !mailboxes.isPending ? (
        <Panel>
          <PanelBody>
            <p className="text-xs text-muted-foreground">
              未找到该邮箱。它可能已被移除。
            </p>
            <Button variant="outline" size="sm" className="mt-2.5" render={<Link to="/mailboxes" />}>
              返回邮箱列表
            </Button>
          </PanelBody>
        </Panel>
      ) : null}
    </>
  );
}
