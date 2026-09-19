import { Button } from "@email-relay/ui/components/button";
import { Panel, PanelActions, PanelBody, PanelHeader, PanelTitle } from "@email-relay/ui/components/panel";
import { Skeleton } from "@email-relay/ui/components/skeleton";
import { cn } from "@email-relay/ui/lib/utils";

import ProviderGlyph from "@/components/provider-glyph";

type InboxSidebarValue = {
  provider?: string;
  groupId?: string;
  mailboxId?: string;
  status?: string;
};

/**
 * Filter chip.
 *
 * Kept as a real <button> with aria-pressed rather than a listbox: the sidebar
 * tests select these by `role="button"` and the multi-axis layout reads better as
 * toggles than as selects.
 */
function Chip({
  active,
  onClick,
  children,
  className,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-sm border px-2 text-[0.6875rem] font-medium transition-colors",
        active
          ? "border-brand-border bg-brand-muted text-brand"
          : "border-border bg-card text-muted-foreground hover:border-border-strong hover:text-foreground",
        className,
      )}
    >
      {children}
    </button>
  );
}

function FilterSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-1.5">
      {/* Kept as h2 to preserve the existing heading semantics */}
      <h2 className="label-caps text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}

export default function InboxSidebar({
  groups,
  mailboxes,
  value,
  onChange,
  onReset,
  isLoading = false,
}: {
  groups: Array<{ id: string; name: string }>;
  mailboxes: Array<{ id: string; address: string; provider: string; status: string }>;
  value: InboxSidebarValue;
  onChange: (patch: Partial<InboxSidebarValue>) => void;
  onReset?: () => void;
  isLoading?: boolean;
}) {
  const providers = [...new Set(mailboxes.map((mailbox) => mailbox.provider))];
  const statuses = [...new Set(mailboxes.map((mailbox) => mailbox.status))];
  const hasFilter = Object.values(value).some((entry) => entry !== undefined && entry !== "");

  return (
    <Panel className="self-start">
      <PanelHeader>
        <PanelTitle>筛选</PanelTitle>
        <PanelActions>
          {hasFilter && onReset ? (
            <Button variant="ghost" size="sm" onClick={onReset}>
              清除
            </Button>
          ) : null}
        </PanelActions>
      </PanelHeader>
      <PanelBody className="flex flex-col gap-3.5">
        {isLoading ? (
          <>
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-6" />
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-6" />
          </>
        ) : (
          <>
            <FilterSection title="分组">
              <div className="flex flex-wrap gap-1">
                <Chip active={value.groupId === undefined} onClick={() => onChange({ groupId: undefined })}>
                  全部分组
                </Chip>
                {groups.map((group) => (
                  <Chip
                    key={group.id}
                    active={value.groupId === group.id}
                    onClick={() => onChange({ groupId: group.id })}
                  >
                    {group.name}
                  </Chip>
                ))}
              </div>
            </FilterSection>

            <FilterSection title="Provider">
              <div className="flex flex-wrap gap-1">
                <Chip active={value.provider === undefined} onClick={() => onChange({ provider: undefined })}>
                  全部 Provider
                </Chip>
                {providers.map((provider) => (
                  <Chip
                    key={provider}
                    active={value.provider === provider}
                    onClick={() => onChange({ provider })}
                  >
                    {/* Uppercase transform is asserted by the sidebar test */}
                    {provider.toUpperCase()}
                  </Chip>
                ))}
              </div>
            </FilterSection>

            <FilterSection title="邮箱">
              <div className="flex flex-col gap-px">
                <Chip
                  className="w-full justify-start"
                  active={value.mailboxId === undefined}
                  onClick={() => onChange({ mailboxId: undefined })}
                >
                  全部邮箱
                </Chip>
                {mailboxes.map((mailbox) => (
                  <Chip
                    key={mailbox.id}
                    className="w-full justify-start"
                    active={value.mailboxId === mailbox.id}
                    onClick={() => onChange({ mailboxId: mailbox.id })}
                  >
                    <ProviderGlyph provider={mailbox.provider} className="size-4 text-[0.5rem]" />
                    <span className="min-w-0 truncate">{mailbox.address}</span>
                  </Chip>
                ))}
              </div>
            </FilterSection>

            <FilterSection title="同步状态">
              <div className="flex flex-wrap gap-1">
                <Chip active={value.status === undefined} onClick={() => onChange({ status: undefined })}>
                  全部状态
                </Chip>
                {statuses.map((status) => (
                  <Chip
                    key={status}
                    active={value.status === status}
                    onClick={() => onChange({ status })}
                  >
                    {status.toUpperCase()}
                  </Chip>
                ))}
              </div>
            </FilterSection>
          </>
        )}
      </PanelBody>
    </Panel>
  );
}
