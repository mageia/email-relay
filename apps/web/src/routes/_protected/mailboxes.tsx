import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import ConnectGmailButton from "@/components/connect-gmail-button";
import ConnectImapForm, { type ConnectImapValue } from "@/components/connect-imap-form";
import ConnectOutlookButton from "@/components/connect-outlook-button";
import MailboxStatusCard from "@/components/mailbox-status-card";
import { client, orpc, queryClient } from "@/utils/orpc";

export const Route = createFileRoute("/_protected/mailboxes")({
  component: MailboxesPage,
});

function MailboxesPage() {
  const mailboxes = useQuery(orpc.mailboxes.list.queryOptions());

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">邮箱</h1>
          <p className="text-sm text-muted-foreground">先接入 Gmail / Outlook，后续再补 IMAP。</p>
        </div>
        <div className="flex gap-3">
          <ConnectGmailButton />
          <ConnectOutlookButton />
        </div>
      </div>
      <div className="grid gap-4">
        {(mailboxes.data ?? []).map(
          (mailbox: { id: string; address: string; provider: string; status: string }) => (
            <MailboxStatusCard key={mailbox.id} mailbox={mailbox} />
          ),
        )}
        {mailboxes.data?.length === 0 ? (
          <p className="text-sm text-muted-foreground">还没有已接入邮箱。</p>
        ) : null}
      </div>
      <ConnectImapSection />
    </div>
  );
}

function ConnectImapSection() {
  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-xl font-semibold">连接 IMAP</h2>
        <p className="text-sm text-muted-foreground">自动发现优先，失败时可手动补 Host / Port。</p>
      </div>
      <ConnectImapForm
        isSubmitting={false}
        onSubmit={async (value) => {
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

          await queryClient.invalidateQueries({
            queryKey: orpc.mailboxes.list.queryKey(),
          });
          await queryClient.invalidateQueries({
            queryKey: orpc.inbox.listFilters.queryKey(),
          });
        }}
      />
    </div>
  );
}
