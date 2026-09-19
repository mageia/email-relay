import { Button } from "@email-relay/ui/components/button";
import { cn } from "@email-relay/ui/lib/utils";
import { TriangleAlertIcon } from "lucide-react";

/**
 * Explicit failure state with a retry affordance.
 *
 * Previously no page had component-level error handling: every query fell back
 * to `?? []` and the only signal was a global toast, so a failed load looked
 * identical to an empty result.
 */
export default function ErrorState({
  title = "加载失败",
  description,
  error,
  onRetry,
  className,
}: {
  title?: string;
  description?: string;
  /** Raw error; its message is shown in monospace for copy/paste into logs. */
  error?: unknown;
  onRetry?: () => void;
  className?: string;
}) {
  const message = error instanceof Error ? error.message : error ? String(error) : null;

  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center gap-2.5 px-6 py-12 text-center",
        className,
      )}
    >
      <div
        aria-hidden="true"
        className="grid size-9 place-items-center rounded-sm border border-destructive-border bg-destructive-muted text-destructive [&_svg]:size-4"
      >
        <TriangleAlertIcon />
      </div>
      <h3 className="text-[0.8125rem] font-semibold">{title}</h3>
      {description ? (
        <p className="max-w-[24rem] text-xs leading-relaxed text-muted-foreground">
          {description}
        </p>
      ) : null}
      {message ? (
        <p className="max-w-[28rem] rounded-sm border border-border bg-surface-sunken px-2 py-1 font-mono text-[0.6875rem] break-all text-muted-foreground">
          {message}
        </p>
      ) : null}
      {onRetry ? (
        <Button variant="outline" size="sm" className="mt-1" onClick={onRetry}>
          重试
        </Button>
      ) : null}
    </div>
  );
}
