import { Card, CardContent, CardHeader, CardTitle } from "@email-relay/ui/components/card";

export default function AlertSummaryCards({
  summary,
}: {
  summary: { openAlerts: number; staleMailboxes: number; retriesQueued: number };
}) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle>未解决告警</CardTitle>
        </CardHeader>
        <CardContent>{summary.openAlerts}</CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>超时未同步邮箱</CardTitle>
        </CardHeader>
        <CardContent>{summary.staleMailboxes}</CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>待重试任务</CardTitle>
        </CardHeader>
        <CardContent>{summary.retriesQueued}</CardContent>
      </Card>
    </div>
  );
}
