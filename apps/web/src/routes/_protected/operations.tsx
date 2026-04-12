import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_protected/operations")({
  component: OperationsPage,
});

function OperationsPage() {
  return (
    <div className="rounded-xl border p-4">
      <h1 className="mb-2 text-2xl font-semibold">Sync Operations</h1>
      <p className="text-sm text-muted-foreground">
        这里会集中放历史补拉、重试、告警与同步运维能力。本阶段已把 mailbox / group backfill
        入口接到邮箱页和分组页。
      </p>
    </div>
  );
}
