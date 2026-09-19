import { cn } from "@email-relay/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

const badgeVariants = cva(
  "inline-flex h-[1.125rem] shrink-0 items-center gap-1.5 rounded-sm border px-1.5 text-[0.6875rem] font-medium whitespace-nowrap",
  {
    variants: {
      tone: {
        neutral: "border-border bg-muted text-muted-foreground",
        brand: "border-brand-border bg-brand-muted text-brand",
        success: "border-success-border bg-success-muted text-success",
        warning: "border-warning-border bg-warning-muted text-warning",
        danger: "border-destructive-border bg-destructive-muted text-destructive",
        /* For provider names and other raw identifiers */
        outline: "border-border bg-transparent text-muted-foreground",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

type BadgeProps = React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & {
    /** Renders a leading dot. Use for live state, not for static labels. */
    dot?: boolean;
  };

function Badge({ className, tone, dot = false, children, ...props }: BadgeProps) {
  return (
    <span data-slot="badge" className={cn(badgeVariants({ tone, className }))} {...props}>
      {dot ? (
        <span
          aria-hidden="true"
          className="size-[5px] shrink-0 rounded-full bg-current"
        />
      ) : null}
      {children}
    </span>
  );
}

export { Badge, badgeVariants };
