import { Label } from "@email-relay/ui/components/label";
import { cn } from "@email-relay/ui/lib/utils";
import { CircleAlertIcon } from "lucide-react";
import * as React from "react";

/**
 * Label + control + hint/error, with the accessibility wiring done once.
 *
 * The previous forms set `aria-invalid` on seven inputs but never associated the
 * error text, so a screen reader announced "invalid" without saying why. This
 * links both hint and error via aria-describedby and marks the error `role=alert`
 * so it is announced when it appears.
 *
 * Children receive the id/aria props, so call sites pass a plain <Input />
 * without repeating wiring:
 *
 *   <Field id="imap-port" label="手动 Port（可选）" error={portError}>
 *     <Input value={port} onChange={...} />
 *   </Field>
 */
export default function Field({
  id,
  label,
  hint,
  error,
  required,
  className,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
  className?: string;
  children: React.ReactElement<{
    id?: string;
    "aria-invalid"?: boolean;
    "aria-describedby"?: string;
    "aria-required"?: boolean;
  }>;
}) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  const control = React.cloneElement(children, {
    id,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": describedBy,
    "aria-required": required || undefined,
  });

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {/* The required marker is rendered via CSS content rather than as a text
          node: anything inside <label> becomes part of the control's accessible
          name, which would break label-based queries and make screen readers
          announce "asterisk". Requiredness is conveyed by aria-required instead. */}
      <Label
        htmlFor={id}
        data-required={required || undefined}
        className="text-xs font-medium data-[required]:after:ml-0.5 data-[required]:after:text-destructive data-[required]:after:content-['*']"
      >
        {label}
      </Label>
      {control}
      {hint && !error ? (
        <p id={hintId} className="text-[0.6875rem] leading-relaxed text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p
          id={errorId}
          role="alert"
          className="flex items-start gap-1 text-[0.6875rem] text-destructive"
        >
          <CircleAlertIcon aria-hidden="true" className="mt-px size-3 shrink-0" />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}
