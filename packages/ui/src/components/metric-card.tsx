import { cn } from "@email-relay/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

/* The left edge rule carries the tone, so the number itself stays legible
   instead of being colored for decoration. */
const metricVariants = cva(
  "relative overflow-hidden rounded-sm border border-border bg-card px-3.5 py-3 before:absolute before:inset-y-0 before:left-0 before:w-0.5",
  {
    variants: {
      tone: {
        neutral: "before:bg-border-strong",
        brand: "before:bg-brand",
        success: "before:bg-success",
        warning: "before:bg-warning",
        danger: "before:bg-destructive",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

/* Only alarming values are tinted; a healthy count reads as plain foreground. */
const valueToneClass: Record<string, string> = {
  neutral: "text-foreground",
  brand: "text-foreground",
  success: "text-foreground",
  warning: "text-warning",
  danger: "text-destructive",
};

export default function MetricCard({
  label,
  value,
  detail,
  icon,
  tone = "neutral",
  className,
}: {
  label: string;
  value: React.ReactNode;
  detail?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
} & VariantProps<typeof metricVariants>) {
  return (
    <div className={cn(metricVariants({ tone, className }))}>
      <div className="label-caps flex items-center gap-1.5 text-muted-foreground">
        {icon ? (
          <span aria-hidden="true" className="[&_svg]:size-3">
            {icon}
          </span>
        ) : null}
        {label}
      </div>
      <div
        className={cn(
          "mt-1.5 text-2xl leading-none font-semibold tracking-[-0.03em] tabular-nums",
          valueToneClass[tone ?? "neutral"],
        )}
      >
        {value}
      </div>
      {detail ? (
        <div className="mt-1.5 text-[0.6875rem] text-muted-foreground">{detail}</div>
      ) : null}
    </div>
  );
}
