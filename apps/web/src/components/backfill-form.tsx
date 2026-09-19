import { Button } from "@email-relay/ui/components/button";
import Field from "@email-relay/ui/components/field";
import { Input } from "@email-relay/ui/components/input";
import * as React from "react";

const DEFAULT_BACKFILL_RANGE_DAYS = 7;
const DAY_IN_MS = 24 * 60 * 60 * 1000;

type BackfillFormValue = {
  rangeStart: string;
  rangeEnd: string;
};

type BackfillFormErrors = Partial<Record<keyof BackfillFormValue, string>>;

function toDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function validateBackfillRange(value: BackfillFormValue, today: string): BackfillFormErrors {
  const errors: BackfillFormErrors = {};

  if (!value.rangeStart) {
    errors.rangeStart = "请选择开始日期";
  } else if (value.rangeStart > today) {
    errors.rangeStart = "日期不能晚于今天";
  }

  if (!value.rangeEnd) {
    errors.rangeEnd = "请选择结束日期";
  } else if (value.rangeEnd > today) {
    errors.rangeEnd = "日期不能晚于今天";
  }

  if (value.rangeStart && value.rangeEnd && value.rangeStart > value.rangeEnd) {
    errors.rangeStart ??= "开始日期不能晚于结束日期";
    errors.rangeEnd ??= "结束日期不能早于开始日期";
  }

  return errors;
}

export default function BackfillForm({
  onSubmit,
  isSubmitting,
  /** Rendered between the date fields and the submit button. */
  children,
  /** Unique prefix for field ids, needed when several forms share a page. */
  idPrefix = "",
}: {
  onSubmit: (value: BackfillFormValue) => Promise<void>;
  isSubmitting: boolean;
  children?: React.ReactNode;
  idPrefix?: string;
}) {
  const today = toDateInputValue(new Date());
  const [value, setValue] = React.useState<BackfillFormValue>({
    rangeStart: toDateInputValue(new Date(Date.now() - DEFAULT_BACKFILL_RANGE_DAYS * DAY_IN_MS)),
    rangeEnd: today,
  });
  const errors = React.useMemo(() => validateBackfillRange(value, today), [today, value]);
  const hasErrors = Object.values(errors).some(Boolean);

  const startId = `${idPrefix}rangeStart`;
  const endId = `${idPrefix}rangeEnd`;

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (hasErrors) {
          return;
        }
        void onSubmit(value);
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto] lg:items-start">
        <Field id={startId} label="开始日期" error={errors.rangeStart}>
          <Input
            max={today}
            type="date"
            value={value.rangeStart}
            onChange={(event) =>
              setValue((current) => ({ ...current, rangeStart: event.target.value }))
            }
          />
        </Field>
        <Field id={endId} label="结束日期" error={errors.rangeEnd}>
          <Input
            max={today}
            type="date"
            value={value.rangeEnd}
            onChange={(event) =>
              setValue((current) => ({ ...current, rangeEnd: event.target.value }))
            }
          />
        </Field>
        <Button
          type="submit"
          variant="brand"
          disabled={isSubmitting || hasErrors}
          /* Aligns with the inputs, which sit below their labels */
          className="mt-0 self-start sm:col-span-2 sm:justify-self-start lg:col-span-1 lg:mt-[1.375rem]"
        >
          {isSubmitting ? "提交中..." : "触发补拉"}
        </Button>
      </div>
      {children}
    </form>
  );
}
