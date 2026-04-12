import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { client, orpc, queryClient } from "@/utils/orpc";

export const Route = createFileRoute("/_protected/alerts")({
  component: AlertsPage,
});

function AlertsPage() {
  const alerts = useQuery(orpc.alerts.list.queryOptions());
  const resolveAlert = useMutation({
    mutationFn: async (alertId: string) => client.alerts.resolve({ alertId }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: orpc.alerts.list.queryKey(),
      });
      await queryClient.invalidateQueries({
        queryKey: orpc.alerts.summary.queryKey(),
      });
    },
  });

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
                {alert.status !== "resolved" ? (
                  <button
                    className="mt-3 text-sm text-blue-600 hover:underline"
                    onClick={() => {
                      resolveAlert.mutate(alert.id);
                    }}
                  >
                    Resolve
                  </button>
                ) : null}
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
