import { Button } from "@email-relay/ui/components/button";

type InboxSidebarValue = {
  provider?: string;
  groupId?: string;
  mailboxId?: string;
  status?: string;
};

function FilterSection(props: {
  title: string;
  options: Array<{ id?: string; label: string; value?: string }>;
  selectedValue?: string;
  onChange: (value?: string) => void;
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-medium text-muted-foreground">{props.title}</h2>
      <div className="flex flex-wrap gap-2">
        {props.options.map((option) => {
          const key = option.id ?? option.label;
          const active = props.selectedValue === option.value;

          return (
            <Button
              key={key}
              size="sm"
              type="button"
              variant={active ? "default" : "outline"}
              onClick={() => props.onChange(option.value)}
            >
              {option.label}
            </Button>
          );
        })}
      </div>
    </section>
  );
}

export default function InboxSidebar({
  groups,
  mailboxes,
  value,
  onChange,
}: {
  groups: Array<{ id: string; name: string }>;
  mailboxes: Array<{ id: string; address: string; provider: string; status: string }>;
  value: InboxSidebarValue;
  onChange: (patch: Partial<InboxSidebarValue>) => void;
}) {
  const providerOptions = [undefined, ...new Set(mailboxes.map((mailbox) => mailbox.provider))].map((provider) => ({
    label: provider ? provider.toUpperCase() : "全部 Provider",
    value: provider,
  }));
  const statusOptions = [undefined, ...new Set(mailboxes.map((mailbox) => mailbox.status))].map((status) => ({
    label: status ? status.toUpperCase() : "全部状态",
    value: status,
  }));

  return (
    <div className="space-y-6 rounded-xl border p-4">
      <FilterSection
        title="分组"
        options={[{ label: "全部分组", value: undefined }, ...groups.map((group) => ({ id: group.id, label: group.name, value: group.id }))]}
        selectedValue={value.groupId}
        onChange={(groupId) => onChange({ groupId })}
      />
      <FilterSection
        title="Provider"
        options={providerOptions}
        selectedValue={value.provider}
        onChange={(provider) => onChange({ provider })}
      />
      <FilterSection
        title="邮箱"
        options={[{ label: "全部邮箱", value: undefined }, ...mailboxes.map((mailbox) => ({ id: mailbox.id, label: mailbox.address, value: mailbox.id }))]}
        selectedValue={value.mailboxId}
        onChange={(mailboxId) => onChange({ mailboxId })}
      />
      <FilterSection
        title="同步状态"
        options={statusOptions}
        selectedValue={value.status}
        onChange={(status) => onChange({ status })}
      />
    </div>
  );
}
