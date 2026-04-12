import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/_protected/alerts")({
  component: AlertsPage,
});

function AlertsPage() {
  const alerts = useQuery(orpc.alerts.list.queryOptions());

  return (
    <div className="rounded-xl border p-4">
      <h1 className="mb-4 text-2xl font-semibold">告警面板</h1>
      {alerts.data?.length ? (
        <ul className="space-y-3">
          {alerts.data.map(
            (alert: { id: string; title: string; detail: string; severity: string; status: string }) => (
              <li key={alert.id} className="rounded-lg border p-3">
                <div className="font-medium">{alert.title}</div>
                <div className="text-sm text-muted-foreground">{alert.detail}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {alert.severity} · {alert.status}
                </div>
              </li>
            ),
          )}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">当前没有告警。</p>
      )}
    </div>
  );
}
