import { Button } from "@email-relay/ui/components/button";
import { Input } from "@email-relay/ui/components/input";
import { Label } from "@email-relay/ui/components/label";
import { useForm } from "@tanstack/react-form";

export type GroupFormValue = {
  name: string;
  kind: "personal" | "project" | "client" | "other";
  description: string;
};

export default function GroupForm({
  onSubmit,
  isSubmitting,
}: {
  onSubmit: (value: GroupFormValue) => Promise<void>;
  isSubmitting: boolean;
}) {
  const form = useForm({
    defaultValues: {
      name: "",
      kind: "personal" as GroupFormValue["kind"],
      description: "",
    },
    onSubmit: async ({ value }) => onSubmit(value as GroupFormValue),
  });

  return (
    <form
      className="space-y-4 rounded-xl border p-4"
      onSubmit={(event) => {
        event.preventDefault();
        form.handleSubmit();
      }}
    >
      <form.Field name="name">
        {(field) => (
          <div className="space-y-2">
            <Label htmlFor={field.name}>分组名称</Label>
            <Input
              id={field.name}
              value={field.state.value}
              onChange={(event) => field.handleChange(event.target.value)}
            />
          </div>
        )}
      </form.Field>

      <form.Field name="kind">
        {(field) => (
          <div className="space-y-2">
            <Label htmlFor={field.name}>分组类型</Label>
            <select
              id={field.name}
              className="h-10 w-full rounded-md border bg-background px-3"
              value={field.state.value}
              onChange={(event) =>
                field.handleChange(event.target.value as GroupFormValue["kind"])
              }
            >
              <option value="personal">个人</option>
              <option value="project">项目</option>
              <option value="client">客户</option>
              <option value="other">其他</option>
            </select>
          </div>
        )}
      </form.Field>

      <form.Field name="description">
        {(field) => (
          <div className="space-y-2">
            <Label htmlFor={field.name}>说明</Label>
            <Input
              id={field.name}
              value={field.state.value}
              onChange={(event) => field.handleChange(event.target.value)}
            />
          </div>
        )}
      </form.Field>

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "保存中..." : "保存分组"}
      </Button>
    </form>
  );
}
