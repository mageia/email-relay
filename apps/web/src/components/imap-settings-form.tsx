import { Button } from "@email-relay/ui/components/button";
import { Input } from "@email-relay/ui/components/input";
import { Label } from "@email-relay/ui/components/label";
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
  const [selectedIds, setSelectedIds] = useState<string[]>(folders.filter((folder) => folder.selected).map((folder) => folder.id));

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
    <div className="rounded-xl border p-4 space-y-4">
      <div>
        <h2 className="text-lg font-medium">IMAP 设置</h2>
        <p className="text-sm text-muted-foreground">可调整服务器参数，并选择需要轮询的文件夹。</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="imap-username">用户名</Label>
          <Input id="imap-username" value={username} onChange={(event) => setUsername(event.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="imap-host">Host</Label>
          <Input id="imap-host" value={host} onChange={(event) => setHost(event.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="imap-port">Port</Label>
          <Input id="imap-port" type="number" value={port} onChange={(event) => setPort(event.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-sm pt-6">
          <input aria-label="TLS" checked={secure} type="checkbox" onChange={(event) => setSecure(event.target.checked)} />
          启用 TLS
        </label>
      </div>
      <div className="text-xs text-muted-foreground">发现来源：{settings.discoverySource ?? "unknown"}</div>
      <ul className="space-y-3 text-sm">
        {folders.length === 0 ? <li className="text-muted-foreground">暂无已选择文件夹</li> : null}
        {folders.map((folder) => {
          const checked = selectedIds.includes(folder.id);
          return (
            <li key={folder.id} className="flex items-center gap-3">
              <input
                aria-label={folder.name}
                checked={checked}
                className="size-4"
                type="checkbox"
                onChange={(event) => {
                  setSelectedIds((current) => {
                    if (event.target.checked) {
                      return [...current, folder.id];
                    }

                    return current.filter((id) => id !== folder.id);
                  });
                }}
              />
              <span>{folder.name}</span>
              <span className="text-xs text-muted-foreground">{folder.kind}</span>
            </li>
          );
        })}
      </ul>
      <Button
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
    </div>
  );
}
