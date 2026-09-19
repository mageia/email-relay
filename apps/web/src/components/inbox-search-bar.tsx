import { Input } from "@email-relay/ui/components/input";
import { SearchIcon } from "lucide-react";

export default function InboxSearchBar({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="relative w-full">
      <SearchIcon
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        className="pl-7"
        placeholder="搜索主题、摘要或正文"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
