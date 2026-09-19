import { cn } from "@email-relay/ui/lib/utils";
import * as React from "react";

/**
 * Page title block with optional right-aligned actions.
 * Each page previously hand-rolled its own `<h1 className="text-2xl ...">`, so
 * the heading scale drifted between routes.
 */
export default function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-start gap-4", className)}>
      <div className="min-w-0">
        <h1 className="flex items-center gap-2 text-lg leading-tight font-semibold tracking-[-0.015em]">
          {title}
        </h1>
        {description ? (
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="ml-auto flex shrink-0 gap-2">{actions}</div> : null}
    </div>
  );
}
