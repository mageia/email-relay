import { Button } from "@email-relay/ui/components/button";
import { Input } from "@email-relay/ui/components/input";
import { Label } from "@email-relay/ui/components/label";
import { useForm } from "@tanstack/react-form";

export default function BackfillForm({
  onSubmit,
  isSubmitting,
}: {
  onSubmit: (value: { rangeStart: string; rangeEnd: string }) => Promise<void>;
  isSubmitting: boolean;
}) {
  const form = useForm({
    defaultValues: {
      rangeStart: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      rangeEnd: new Date().toISOString().slice(0, 10),
    },
    onSubmit: async ({ value }) => onSubmit(value),
  });

  return (
    <form
      className="grid gap-4 md:grid-cols-[1fr_1fr_auto]"
      onSubmit={(event) => {
        event.preventDefault();
        form.handleSubmit();
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="rangeStart">开始日期</Label>
        <Input
          id="rangeStart"
          type="date"
          value={form.state.values.rangeStart}
          onChange={(event) => form.setFieldValue("rangeStart", event.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="rangeEnd">结束日期</Label>
        <Input
          id="rangeEnd"
          type="date"
          value={form.state.values.rangeEnd}
          onChange={(event) => form.setFieldValue("rangeEnd", event.target.value)}
        />
      </div>
      <Button type="submit" disabled={isSubmitting} className="self-end">
        {isSubmitting ? "提交中..." : "触发补拉"}
      </Button>
    </form>
  );
}
