import { Button } from "@email-relay/ui/components/button";
import { useEffect, useState } from "react";

type FolderLabel = {
  id: string;
  name: string;
  kind: string;
  selected: boolean;
};

export default function GmailLabelSelector({
  title = "同步标签",
  labels,
  isSaving,
  onSave,
}: {
  title?: string;
  labels: FolderLabel[];
  isSaving: boolean;
  onSave: (labels: Array<{ id: string; name: string; kind: string }>) => Promise<void>;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>(labels.filter((label) => label.selected).map((label) => label.id));

  useEffect(() => {
    setSelectedIds(labels.filter((label) => label.selected).map((label) => label.id));
  }, [labels]);

  return (
    <div className="rounded-xl border p-4 space-y-4">
      <div>
        <h2 className="text-lg font-medium">{title}</h2>
        <p className="text-sm text-muted-foreground">调整当前邮箱要同步的标签或文件夹。</p>
      </div>
      <ul className="space-y-3 text-sm">
        {labels.length === 0 ? <li className="text-muted-foreground">暂无可选标签或文件夹</li> : null}
        {labels.map((label) => {
          const checked = selectedIds.includes(label.id);
          return (
            <li key={label.id} className="flex items-center gap-3">
              <input
                aria-label={label.name}
                checked={checked}
                className="size-4"
                type="checkbox"
                onChange={(event) => {
                  setSelectedIds((current) => {
                    if (event.target.checked) {
                      return [...current, label.id];
                    }

                    return current.filter((id) => id !== label.id);
                  });
                }}
              />
              <span>{label.name}</span>
              <span className="text-xs text-muted-foreground">{label.kind}</span>
            </li>
          );
        })}
      </ul>
      <Button
        disabled={isSaving}
        type="button"
        onClick={() => {
          void onSave(
            labels
              .filter((label) => selectedIds.includes(label.id))
              .map((label) => ({ id: label.id, name: label.name, kind: label.kind })),
          );
        }}
      >
        {isSaving ? "保存中..." : "保存选择"}
      </Button>
    </div>
  );
}
