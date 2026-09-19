import { Badge } from "@email-relay/ui/components/badge";
import { Button } from "@email-relay/ui/components/button";
import Field from "@email-relay/ui/components/field";
import { Input } from "@email-relay/ui/components/input";
import { Label } from "@email-relay/ui/components/label";
import {
  Panel,
  PanelActions,
  PanelBody,
  PanelDescription,
  PanelHeader,
  PanelTitle,
} from "@email-relay/ui/components/panel";
import { useEffect, useState } from "react";

type ImapFolderChoice = {
  id: string;
  name: string;
  kind: string;
  selected: boolean;
};

export default function ImapSettingsForm({
  settings,
  folders,
  isSaving,
  onSave,
}: {
  settings: {
    username: string;
    host: string;
    port: number;
    secure: boolean;
    discoverySource?: string;
  };
  folders: ImapFolderChoice[];
  isSaving: boolean;
  onSave: (value: {
    username: string;
    host: string;
    port: number;
    secure: boolean;
    folders: Array<{ id: string; name: string; kind: string }>;
  }) => Promise<void>;
}) {
  const [username, setUsername] = useState(settings.username);
  const [host, setHost] = useState(settings.host);
  const [port, setPort] = useState(String(settings.port));
  const [secure, setSecure] = useState(settings.secure);
  const [selectedIds, setSelectedIds] = useState<string[]>(
    folders.filter((folder) => folder.selected).map((folder) => folder.id),
  );

  useEffect(() => {
    setUsername(settings.username);
    setHost(settings.host);
    setPort(String(settings.port));
    setSecure(settings.secure);
  }, [settings]);

  useEffect(() => {
    setSelectedIds(folders.filter((folder) => folder.selected).map((folder) => folder.id));
  }, [folders]);

  return (
    <Panel>
      <PanelHeader>
        <div className="min-w-0">
          <PanelTitle>IMAP 设置</PanelTitle>
          <PanelDescription>可调整服务器参数，并选择需要轮询的文件夹。</PanelDescription>
        </div>
        <PanelActions>
          <Badge tone="outline">发现来源：{settings.discoverySource ?? "unknown"}</Badge>
          <Button
            variant="brand"
            size="sm"
            disabled={isSaving}
            type="button"
            onClick={() => {
              void onSave({
                username,
                host,
                port: Number(port),
                secure,
                folders: folders
                  .filter((folder) => selectedIds.includes(folder.id))
                  .map((folder) => ({ id: folder.id, name: folder.name, kind: folder.kind })),
              });
            }}
          >
            {isSaving ? "保存中..." : "保存 IMAP 设置"}
          </Button>
        </PanelActions>
      </PanelHeader>

      <PanelBody className="flex flex-col gap-3.5">
        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
          <Field id="imap-username" label="用户名">
            <Input value={username} onChange={(event) => setUsername(event.target.value)} />
          </Field>
          <Field id="imap-host" label="Host">
            <Input value={host} onChange={(event) => setHost(event.target.value)} />
          </Field>
          <Field id="imap-port" label="Port">
            <Input type="number" value={port} onChange={(event) => setPort(event.target.value)} />
          </Field>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-medium">连接选项</Label>
            <Label className="flex h-7 cursor-pointer items-center gap-2 text-xs font-normal">
              <input
                aria-label="TLS"
                checked={secure}
                type="checkbox"
                className="size-3.5 shrink-0 accent-brand"
                onChange={(event) => setSecure(event.target.checked)}
              />
              启用 TLS
            </Label>
          </div>
        </div>

        <div>
          <div className="label-caps mb-1.5 text-muted-foreground">
            轮询文件夹
            {folders.length > 0 ? (
              <span className="ml-1.5 tabular-nums">
                ({selectedIds.length}/{folders.length})
              </span>
            ) : null}
          </div>
          {folders.length === 0 ? (
            <p className="text-xs text-muted-foreground">暂无已选择文件夹</p>
          ) : (
            <ul className="grid gap-px sm:grid-cols-2 lg:grid-cols-3">
              {folders.map((folder) => {
                const checked = selectedIds.includes(folder.id);

                return (
                  <li key={folder.id}>
                    <Label className="flex cursor-pointer items-center gap-2 rounded-sm px-1.5 py-1 text-xs font-normal hover:bg-muted">
                      <input
                        aria-label={folder.name}
                        checked={checked}
                        type="checkbox"
                        className="size-3.5 shrink-0 accent-brand"
                        onChange={(event) => {
                          setSelectedIds((current) =>
                            event.target.checked
                              ? [...current, folder.id]
                              : current.filter((id) => id !== folder.id),
                          );
                        }}
                      />
                      <span className="min-w-0 truncate">{folder.name}</span>
                      <Badge tone="outline" className="ml-auto shrink-0">
                        {folder.kind}
                      </Badge>
                    </Label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </PanelBody>
    </Panel>
  );
}
