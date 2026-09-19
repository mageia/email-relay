import { Badge } from "@email-relay/ui/components/badge";
import { Button } from "@email-relay/ui/components/button";
import EmptyState from "@email-relay/ui/components/empty-state";
import { Label } from "@email-relay/ui/components/label";
import {
  Panel,
  PanelActions,
  PanelBody,
  PanelDescription,
  PanelHeader,
  PanelTitle,
} from "@email-relay/ui/components/panel";
import { TagIcon } from "lucide-react";
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
  const [selectedIds, setSelectedIds] = useState<string[]>(
    labels.filter((label) => label.selected).map((label) => label.id),
  );

  useEffect(() => {
    setSelectedIds(labels.filter((label) => label.selected).map((label) => label.id));
  }, [labels]);

  return (
    <Panel>
      <PanelHeader>
        <div className="min-w-0">
          <PanelTitle>{title}</PanelTitle>
          <PanelDescription>调整当前邮箱要同步的标签或文件夹。</PanelDescription>
        </div>
        <PanelActions>
          {labels.length > 0 ? (
            <>
              <span className="text-[0.6875rem] text-muted-foreground tabular-nums">
                已选 {selectedIds.length} / {labels.length}
              </span>
              <Button
                variant="brand"
                size="sm"
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
            </>
          ) : null}
        </PanelActions>
      </PanelHeader>

      {labels.length === 0 ? (
        <EmptyState
          icon={<TagIcon />}
          title="暂无可选标签或文件夹"
          description="该邮箱尚未返回可同步的标签，稍后重试或检查授权范围。"
        />
      ) : (
        <PanelBody>
          <ul className="grid gap-px sm:grid-cols-2 lg:grid-cols-3">
            {labels.map((label) => {
              const checked = selectedIds.includes(label.id);

              return (
                <li key={label.id}>
                  {/* Native input rather than the Base UI Checkbox: that
                      primitive renders a <span role="checkbox">, and nesting it
                      in a <label> makes a single click toggle twice (once
                      directly, once forwarded by the label). Wrapping in <label>
                      still makes the text clickable, which the previous bare
                      <span> markup did not. */}
                  <Label className="flex cursor-pointer items-center gap-2 rounded-sm px-1.5 py-1 text-xs font-normal hover:bg-muted">
                    <input
                      aria-label={label.name}
                      type="checkbox"
                      checked={checked}
                      className="size-3.5 shrink-0 accent-brand"
                      onChange={(event) => {
                        setSelectedIds((current) =>
                          event.target.checked
                            ? [...current, label.id]
                            : current.filter((id) => id !== label.id),
                        );
                      }}
                    />
                    <span className="min-w-0 truncate">{label.name}</span>
                    <Badge tone="outline" className="ml-auto shrink-0">
                      {label.kind}
                    </Badge>
                  </Label>
                </li>
              );
            })}
          </ul>
        </PanelBody>
      )}
    </Panel>
  );
}
