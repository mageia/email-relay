import { Button } from "@email-relay/ui/components/button";
import Field from "@email-relay/ui/components/field";
import { Input } from "@email-relay/ui/components/input";
import { Panel, PanelBody, PanelHeader, PanelTitle } from "@email-relay/ui/components/panel";
import { useForm } from "@tanstack/react-form";

export type GroupFormValue = {
  name: string;
  kind: "personal" | "project" | "client" | "other";
  description: string;
};

const KIND_OPTIONS = [
  { value: "personal", label: "个人" },
  { value: "project", label: "项目" },
  { value: "client", label: "客户" },
  { value: "other", label: "其他" },
] as const;

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
    <Panel className="self-start">
      <PanelHeader>
        <PanelTitle>新建分组</PanelTitle>
      </PanelHeader>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          form.handleSubmit();
        }}
      >
        <PanelBody className="flex flex-col gap-3">
          <form.Field name="name">
            {(field) => (
              <Field id={field.name} label="分组名称">
                <Input
                  value={field.state.value}
                  placeholder="例如：客户 A"
                  onChange={(event) => field.handleChange(event.target.value)}
                />
              </Field>
            )}
          </form.Field>

          <form.Field name="kind">
            {(field) => (
              <Field id={field.name} label="分组类型">
                {/* Native select on purpose: the group-form test drives it with
                    fireEvent.change, which a custom listbox would not support. */}
                <select
                  className="h-7 w-full rounded-sm border border-input bg-background px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25"
                  value={field.state.value}
                  onChange={(event) =>
                    field.handleChange(event.target.value as GroupFormValue["kind"])
                  }
                >
                  {KIND_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </form.Field>

          <form.Field name="description">
            {(field) => (
              <Field id={field.name} label="说明" hint="可选">
                <Input
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.target.value)}
                />
              </Field>
            )}
          </form.Field>

          <Button type="submit" variant="brand" className="self-start" disabled={isSubmitting}>
            {isSubmitting ? "保存中..." : "保存分组"}
          </Button>
        </PanelBody>
      </form>
    </Panel>
  );
}
