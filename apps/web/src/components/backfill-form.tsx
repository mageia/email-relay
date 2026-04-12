import { Button } from "@email-relay/ui/components/button";
import { Input } from "@email-relay/ui/components/input";
import { Label } from "@email-relay/ui/components/label";
import { useMemo, useState } from "react";

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
}: {
  onSubmit: (value: BackfillFormValue) => Promise<void>;
  isSubmitting: boolean;
}) {
  const today = toDateInputValue(new Date());
  const [value, setValue] = useState<BackfillFormValue>({
    rangeStart: toDateInputValue(new Date(Date.now() - DEFAULT_BACKFILL_RANGE_DAYS * DAY_IN_MS)),
    rangeEnd: today,
  });
  const errors = useMemo(() => validateBackfillRange(value, today), [today, value]);
  const hasErrors = Object.values(errors).some(Boolean);

  return (
    <form
      className="grid gap-4 md:grid-cols-[1fr_1fr_auto]"
      onSubmit={(event) => {
        event.preventDefault();
        if (hasErrors) {
          return;
        }
        void onSubmit(value);
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="rangeStart">开始日期</Label>
        <Input
          aria-invalid={Boolean(errors.rangeStart)}
          id="rangeStart"
          max={today}
          type="date"
          value={value.rangeStart}
          onChange={(event) => setValue((current) => ({ ...current, rangeStart: event.target.value }))}
        />
        {errors.rangeStart ? <p className="text-xs text-red-500">{errors.rangeStart}</p> : null}
      </div>
      <div className="space-y-2">
        <Label htmlFor="rangeEnd">结束日期</Label>
        <Input
          aria-invalid={Boolean(errors.rangeEnd)}
          id="rangeEnd"
          max={today}
          type="date"
          value={value.rangeEnd}
          onChange={(event) => setValue((current) => ({ ...current, rangeEnd: event.target.value }))}
        />
        {errors.rangeEnd ? <p className="text-xs text-red-500">{errors.rangeEnd}</p> : null}
      </div>
      <Button type="submit" disabled={isSubmitting || hasErrors} className="self-end">
        {isSubmitting ? "提交中..." : "触发补拉"}
      </Button>
    </form>
  );
}
