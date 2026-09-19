import { Badge } from "@email-relay/ui/components/badge";

/**
 * Maps a backend status string onto a visual tone.
 *
 * Statuses arrive from several sources (mailbox.status, syncJob.errorCategory,
 * syncAlert.severity) and previously each call site invented its own styling, so
 * the same state could look different on two pages. Unknown values fall back to
 * neutral rather than being dropped, since the backend can introduce new ones.
 */
const TONE_BY_STATUS: Record<string, "success" | "warning" | "danger" | "brand" | "neutral"> = {
  // mailbox.status
  active: "success",
  pending: "neutral",
  stale: "warning",
  "auth-expired": "danger",
  disabled: "neutral",
  // syncJob.status
  queued: "neutral",
  processing: "brand",
  "retry-scheduled": "warning",
  completed: "success",
  failed: "danger",
  // syncJob.errorCategory
  temporary: "neutral",
  "rate-limited": "warning",
  // syncAlert.severity
  high: "danger",
  medium: "warning",
  low: "neutral",
  // syncAlert.status
  open: "warning",
  resolved: "success",
};

/** States that represent live activity and therefore warrant a status dot. */
const LIVE_STATUSES = new Set([
  "active",
  "processing",
  "stale",
  "auth-expired",
  "retry-scheduled",
  "failed",
  "open",
  "high",
  "medium",
]);

export function statusTone(status: string) {
  return TONE_BY_STATUS[status.toLowerCase()] ?? "neutral";
}

export default function StatusBadge({
  status,
  label,
  className,
}: {
  status: string;
  /** Override the visible text; defaults to the raw status. */
  label?: string;
  className?: string;
}) {
  const normalized = status.toLowerCase();

  return (
    <Badge tone={statusTone(normalized)} dot={LIVE_STATUSES.has(normalized)} className={className}>
      {label ?? status}
    </Badge>
  );
}
