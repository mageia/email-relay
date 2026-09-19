import { cn } from "@email-relay/ui/lib/utils";
import * as React from "react";

/**
 * Bordered surface with an optional header row.
 *
 * Replaces the ad-hoc `rounded-xl border p-4` blocks that were repeated across
 * the app layer, which conflicted with the sharp-cornered shared components.
 */
function Panel({ className, ...props }: React.ComponentProps<"section">) {
  return (
    <section
      data-slot="panel"
      className={cn("rounded-sm border border-border bg-card", className)}
      {...props}
    />
  );
}

function PanelHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="panel-header"
      className={cn(
        "flex items-center gap-2.5 border-b border-hairline px-3.5 py-2.5",
        className,
      )}
      {...props}
    />
  );
}

function PanelTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return (
    <h2
      data-slot="panel-title"
      className={cn("text-[0.8125rem] font-semibold tracking-[-0.01em]", className)}
      {...props}
    />
  );
}

function PanelDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="panel-description"
      className={cn("mt-0.5 text-xs leading-relaxed text-muted-foreground", className)}
      {...props}
    />
  );
}

/** Right-aligned actions inside a PanelHeader. */
function PanelActions({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="panel-actions"
      className={cn("ml-auto flex shrink-0 items-center gap-1.5", className)}
      {...props}
    />
  );
}

function PanelBody({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="panel-body" className={cn("p-3.5", className)} {...props} />;
}

export { Panel, PanelHeader, PanelTitle, PanelDescription, PanelActions, PanelBody };
