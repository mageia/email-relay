import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_protected/mailboxes/connect")({
  component: ConnectMailboxPage,
});

function ConnectMailboxPage() {
  return (
    <div className="rounded-xl border p-4">
      <h1 className="mb-2 text-2xl font-semibold">连接邮箱</h1>
      <p className="text-sm text-muted-foreground">本阶段先接入 Gmail，后续再补 Outlook 与 IMAP。</p>
    </div>
  );
}
