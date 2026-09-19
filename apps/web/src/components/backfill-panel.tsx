import { Button } from "@email-relay/ui/components/button";
import Field from "@email-relay/ui/components/field";
import { Panel, PanelBody, PanelDescription, PanelHeader, PanelTitle } from "@email-relay/ui/components/panel";
import { Skeleton } from "@email-relay/ui/components/skeleton";
import { cn } from "@email-relay/ui/lib/utils";
import { InfoIcon } from "lucide-react";
import * as React from "react";

import BackfillForm from "@/components/backfill-form";

type Mailbox = { id: string; address?: string; provider: string; status: string };
type Group = { id: string; name: string; kind: string };

export type MailboxBackfillPayload = {
  mailboxId: string;
  rangeStart: string;
  rangeEnd: string;
};

export type GroupBackfillPayload = {
  groupId: string;
  rangeStart: string;
  rangeEnd: string;
};

type Mode = "mailbox" | "group";

/**
 * Single backfill form with a target selector.
 *
 * Previously each mailbox and each group rendered its own complete date form, so
 * a deployment with 20 mailboxes produced 20 identical forms stacked vertically.
 * One form plus a target picker keeps the page scannable and makes the shared
 * range semantics (documented in the footnote) visible in one place.
 */
export default function BackfillPanel({
  mailboxes,
  groups,
  isLoading,
  onMailboxBackfill,
  onGroupBackfill,
}: {
  mailboxes: Mailbox[];
  groups: Group[];
  isLoading?: boolean;
  onMailboxBackfill: (payload: MailboxBackfillPayload) => Promise<void>;
  onGroupBackfill: (payload: GroupBackfillPayload) => Promise<void>;
}) {
  const [mode, setMode] = React.useState<Mode>("mailbox");
  const [mailboxId, setMailboxId] = React.useState("");
  const [groupId, setGroupId] = React.useState("");
  const [isSubmitting, setSubmitting] = React.useState(false);

  /* Default to the first available target once data arrives. */
  React.useEffect(() => {
    if (!mailboxId && mailboxes.length > 0) setMailboxId(mailboxes[0]!.id);
  }, [mailboxes, mailboxId]);
  React.useEffect(() => {
    if (!groupId && groups.length > 0) setGroupId(groups[0]!.id);
  }, [groups, groupId]);

  const targets = mode === "mailbox" ? mailboxes : groups;
  const selectedId = mode === "mailbox" ? mailboxId : groupId;
  const noTargets = targets.length === 0;

  const handleSubmit = async (value: { rangeStart: string; rangeEnd: string }) => {
    if (!selectedId) return;
    setSubmitting(true);
    try {
      if (mode === "mailbox") {
        await onMailboxBackfill({ mailboxId: selectedId, ...value });
      } else {
        await onGroupBackfill({ groupId: selectedId, ...value });
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Panel>
      <PanelHeader className="flex-col items-stretch gap-2 sm:flex-row sm:items-center">
        <div className="min-w-0">
          <PanelTitle>历史补拉</PanelTitle>
          <PanelDescription>
            选择目标与日期范围，把这段时间的邮件重新入队同步。
          </PanelDescription>
        </div>
        <div
          role="tablist"
          aria-label="补拉目标类型"
          className="ml-auto flex shrink-0 gap-0.5 rounded-sm border border-border bg-surface-sunken p-0.5"
        >
          {(
            [
              { value: "mailbox", label: "按邮箱" },
              { value: "group", label: "按分组" },
            ] as const
          ).map((option) => (
            <button
              key={option.value}
              role="tab"
              type="button"
              aria-selected={mode === option.value}
              onClick={() => setMode(option.value)}
              className={cn(
                "h-6 rounded-sm px-2.5 text-[0.6875rem] font-medium transition-colors",
                mode === option.value
                  ? "bg-card text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </PanelHeader>

      <PanelBody className="flex flex-col gap-3">
        {isLoading ? (
          <>
            <Skeleton className="h-7" />
            <Skeleton className="h-7" />
          </>
        ) : noTargets ? (
          <p className="text-xs text-muted-foreground">
            {mode === "mailbox" ? "目前还没有可补拉的邮箱。" : "当前还没有分组。"}
          </p>
        ) : (
          <>
            <Field
              id={mode === "mailbox" ? "backfill-mailbox" : "backfill-group"}
              label={mode === "mailbox" ? "目标邮箱" : "目标分组"}
              className="max-w-sm"
            >
              <select
                className="h-7 w-full rounded-sm border border-input bg-background px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25"
                value={selectedId}
                onChange={(event) =>
                  mode === "mailbox"
                    ? setMailboxId(event.target.value)
                    : setGroupId(event.target.value)
                }
              >
                {mode === "mailbox"
                  ? mailboxes.map((mailbox) => (
                      <option key={mailbox.id} value={mailbox.id}>
                        {mailbox.address ?? "(未知邮箱)"} · {mailbox.provider}
                      </option>
                    ))
                  : groups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.name} · {group.kind}
                      </option>
                    ))}
              </select>
            </Field>

            <BackfillForm
              idPrefix="ops-"
              isSubmitting={isSubmitting}
              onSubmit={handleSubmit}
            >
              <p className="flex items-start gap-1.5 rounded-sm border border-info-border bg-info-muted px-2.5 py-2 text-[0.6875rem] leading-relaxed text-muted-foreground">
                <InfoIcon aria-hidden="true" className="mt-px size-3 shrink-0 text-brand" />
                <span>
                  结束日期为包含当天。Gmail 按 <code className="font-mono">q=after/before</code>、
                  Outlook 按 <code className="font-mono">receivedDateTime</code>、IMAP 按{" "}
                  <code className="font-mono">SINCE/BEFORE</code> 落实同一区间。
                </span>
              </p>
            </BackfillForm>
          </>
        )}
      </PanelBody>
    </Panel>
  );
}
