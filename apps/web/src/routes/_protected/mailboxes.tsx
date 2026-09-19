import { Badge } from "@email-relay/ui/components/badge";
import EmptyState from "@email-relay/ui/components/empty-state";
import ErrorState from "@email-relay/ui/components/error-state";
import PageHeader from "@email-relay/ui/components/page-header";
import {
  Panel,
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
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { MailboxIcon } from "lucide-react";
import { toast } from "sonner";

import ConnectGmailButton from "@/components/connect-gmail-button";
import ConnectImapForm from "@/components/connect-imap-form";
import ConnectOutlookButton from "@/components/connect-outlook-button";
import ProviderGlyph from "@/components/provider-glyph";
import { client, orpc, queryClient } from "@/utils/orpc";

export const Route = createFileRoute("/_protected/mailboxes")({
  component: MailboxesPage,
});

type Mailbox = {
  id: string;
  address: string;
  provider: string;
  status: string;
  lastSuccessfulSyncAt?: string | Date | null;
};

function MailboxesPage() {
  const mailboxes = useQuery(orpc.mailboxes.list.queryOptions());
  const rows = (mailboxes.data ?? []) as Mailbox[];

  return (
    <>
      <PageHeader
        title="邮箱"
        description="接入并管理需要同步的邮箱账户。"
        actions={
          <>
            <ConnectGmailButton />
            <ConnectOutlookButton />
          </>
        }
      />

      <Panel>
        {mailboxes.isPending ? (
          <div className="flex flex-col gap-2 p-3.5">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-10" />
            ))}
          </div>
        ) : mailboxes.isError ? (
          <ErrorState
            description="无法获取邮箱列表。"
            error={mailboxes.error}
            onRetry={() => mailboxes.refetch()}
          />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<MailboxIcon />}
            title="还没有已接入邮箱。"
            description="使用上方按钮接入 Gmail 或 Outlook，或在下方手动配置 IMAP。"
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>邮箱地址</TableHead>
                <TableHead className="w-24">Provider</TableHead>
                <TableHead className="w-32">状态</TableHead>
                <TableHead className="w-40">上次成功同步</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((mailbox) => (
                <TableRow key={mailbox.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <ProviderGlyph provider={mailbox.provider} />
                      <span className="font-medium">{mailbox.address}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge tone="outline">{mailbox.provider}</Badge>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={mailbox.status} />
                  </TableCell>
                  <TableCell>
                    {mailbox.lastSuccessfulSyncAt ? (
                      <time
                        dateTime={new Date(mailbox.lastSuccessfulSyncAt).toISOString()}
                        className="text-xs text-muted-foreground"
                      >
                        {new Date(mailbox.lastSuccessfulSyncAt).toLocaleString("zh-CN", {
                          hour12: false,
                        })}
                      </time>
                    ) : (
                      <span className="text-xs text-muted-foreground">尚未成功同步</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {/* Router Link rather than a native anchor: the previous card
                        used <a href> and reloaded the whole SPA on every click. */}
                    <Link
                      to="/mailboxes/$mailboxId"
                      params={{ mailboxId: mailbox.id }}
                      className="text-xs text-brand hover:underline"
                    >
                      管理
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>

      <Panel>
        <PanelHeader>
          <div className="min-w-0">
            <PanelTitle>手动接入 IMAP</PanelTitle>
            <PanelDescription>
              自动发现优先，失败时可手动补 Host / Port。先验证连接，成功后写入配置。
            </PanelDescription>
          </div>
        </PanelHeader>
        <ConnectImapForm
          isSubmitting={false}
          onSubmit={async (value) => {
            try {
              const validated = await client.mailboxes.validateImap({
                email: value.email,
                username: value.username,
                password: value.password,
                host: value.host,
                port: value.port,
                secure: value.secure,
              });

              await client.mailboxes.createImap({
                email: value.email,
                username: value.username,
                password: value.password,
                host: validated.settings.host,
                port: validated.settings.port,
                secure: validated.settings.secure,
                authType: validated.settings.authType,
                discoverySource: validated.settings.discoverySource,
                folders: validated.folders,
              });

              await queryClient.invalidateQueries({ queryKey: orpc.mailboxes.list.queryKey() });
              await queryClient.invalidateQueries({ queryKey: orpc.inbox.listFilters.queryKey() });
              toast.success("IMAP 邮箱已接入");
            } catch (error) {
              toast.error(`IMAP 接入失败：${(error as Error).message}`);
              throw error;
            }
          }}
        />
      </Panel>
    </>
  );
}
