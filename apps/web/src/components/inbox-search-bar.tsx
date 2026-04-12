import { Input } from "@email-relay/ui/components/input";

export default function InboxSearchBar({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="rounded-xl border p-3">
      <Input
        placeholder="搜索主题、摘要或正文"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
