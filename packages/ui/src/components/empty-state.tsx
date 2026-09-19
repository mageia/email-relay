import { cn } from "@email-relay/ui/lib/utils";
import * as React from "react";

/**
 * Centered placeholder for "nothing here yet".
 *
 * Distinct from ErrorState on purpose: the app previously fell back to `?? []`
 * everywhere, so a failed request rendered as an empty list and the operator
 * could not tell "no data" from "load failed".
 */
export default function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2.5 px-6 py-12 text-center",
        className,
      )}
    >
      {icon ? (
        <div
          aria-hidden="true"
          className="grid size-9 place-items-center rounded-sm border border-border bg-surface-sunken text-muted-foreground [&_svg]:size-4"
        >
          {icon}
        </div>
      ) : null}
      <h3 className="text-[0.8125rem] font-semibold">{title}</h3>
      {description ? (
        <p className="max-w-[22rem] text-xs leading-relaxed text-muted-foreground">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-1 flex gap-2">{action}</div> : null}
    </div>
  );
}
