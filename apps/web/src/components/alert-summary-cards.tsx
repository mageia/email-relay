import MetricCard from "@email-relay/ui/components/metric-card";
import { AlertCircleIcon, ClockIcon, RefreshCwIcon } from "lucide-react";

/**
 * Shared alert metrics, used on both the inbox and operations pages.
 *
 * Tone is derived from the value rather than fixed: a zero count reads as
 * healthy (green) while any non-zero count escalates, so the operator can scan
 * the row without reading the numbers.
 */
export default function AlertSummaryCards({
  summary,
}: {
  summary: { openAlerts: number; staleMailboxes: number; retriesQueued: number };
}) {
  return (
    <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
      <MetricCard
        tone={summary.openAlerts > 0 ? "danger" : "success"}
        label="未解决告警"
        value={summary.openAlerts}
        icon={<AlertCircleIcon />}
      />
      <MetricCard
        tone={summary.staleMailboxes > 0 ? "warning" : "success"}
        label="超时未同步邮箱"
        value={summary.staleMailboxes}
        detail="超过 1 小时无成功同步"
        icon={<ClockIcon />}
      />
      <MetricCard
        tone={summary.retriesQueued > 0 ? "brand" : "neutral"}
        label="待重试任务"
        value={summary.retriesQueued}
        icon={<RefreshCwIcon />}
      />
    </div>
  );
}
