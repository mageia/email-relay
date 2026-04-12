import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";

import BackfillForm from "@/components/backfill-form";
import GmailLabelSelector from "@/components/gmail-label-selector";
import ImapSettingsForm from "@/components/imap-settings-form";
import { client, orpc, queryClient } from "@/utils/orpc";

export const Route = createFileRoute("/_protected/mailboxes/$mailboxId")({
  component: MailboxDetailPage,
});

function MailboxDetailPage() {
  const { mailboxId } = Route.useParams();
  const mailboxes = useQuery(orpc.mailboxes.list.queryOptions());
  const mailbox = mailboxes.data?.find((entry: { id: string }) => entry.id === mailboxId);
  const folderChoices = useQuery(orpc.mailboxes.getFolderChoices.queryOptions({ input: { mailboxId } }));
  const imapSettings = useQuery(orpc.mailboxes.getImapSettings.queryOptions({ input: { mailboxId } }));
  const saveFolders = useMutation({
    mutationFn: async (labels: Array<{ id: string; name: string; kind: string }>) =>
      client.mailboxes.updateSelectedFolders({
        mailboxId,
        labels,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: orpc.mailboxes.list.queryKey() });
      await queryClient.invalidateQueries({ queryKey: orpc.mailboxes.getFolderChoices.queryKey({ input: { mailboxId } }) });
      toast.success("已更新同步标签/文件夹");
    },
  });

  const pickerTitle =
    mailbox?.provider === "outlook"
      ? "同步文件夹"
      : "同步标签";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">{mailbox?.address ?? "Mailbox"}</h1>
        <p className="text-sm text-muted-foreground">
          {mailbox ? `${mailbox.provider} · ${mailbox.status}` : "正在加载邮箱信息..."}
        </p>
      </div>
      {mailbox ? (
        <BackfillForm
          isSubmitting={false}
          onSubmit={async ({ rangeStart, rangeEnd }) => {
            await client.operations.triggerMailboxBackfill({
              mailboxId: mailbox.id,
              rangeStart: new Date(`${rangeStart}T00:00:00.000Z`).toISOString(),
              rangeEnd: new Date(`${rangeEnd}T00:00:00.000Z`).toISOString(),
            });
          }}
        />
      ) : null}
      {folderChoices.isLoading ? (
        <p className="text-sm text-muted-foreground">正在加载可选标签/文件夹...</p>
      ) : mailbox?.provider === "imap" && imapSettings.data ? (
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
            await queryClient.invalidateQueries({ queryKey: orpc.mailboxes.getFolderChoices.queryKey({ input: { mailboxId } }) });
            await queryClient.invalidateQueries({ queryKey: orpc.mailboxes.getImapSettings.queryKey({ input: { mailboxId } }) });
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
    </div>
  );
}
