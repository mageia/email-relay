import { Button } from "@email-relay/ui/components/button";
import { cn } from "@email-relay/ui/lib/utils";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  BellIcon,
  InboxIcon,
  LogOutIcon,
  MailboxIcon,
  MenuIcon,
  SettingsIcon,
  SlidersHorizontalIcon,
  UsersIcon,
  XIcon,
} from "lucide-react";
import * as React from "react";

import { ModeToggle } from "@/components/mode-toggle";
import { logoutAdmin } from "@/lib/admin-session";
import { orpc } from "@/utils/orpc";

/* Grouped so the sidebar communicates which surfaces are read vs. configured vs.
   operated, instead of presenting six peer links. */
const NAV_GROUPS = [
  {
    label: "邮件",
    items: [
      { to: "/inbox", label: "统一收件箱", icon: InboxIcon },
      { to: "/alerts", label: "告警", icon: BellIcon, badge: "alerts" as const },
    ],
  },
  {
    label: "配置",
    items: [
      { to: "/mailboxes", label: "邮箱", icon: MailboxIcon },
      { to: "/groups", label: "分组", icon: UsersIcon },
    ],
  },
  {
    label: "运维",
    items: [
      { to: "/operations", label: "同步运维", icon: SlidersHorizontalIcon },
      { to: "/settings", label: "设置", icon: SettingsIcon },
    ],
  },
] as const;

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const navigate = useNavigate();
  /* Unresolved alert count drives the sidebar badge. Failure is non-critical, so
     the badge simply hides rather than surfacing an error in the chrome. */
  const summary = useQuery(orpc.alerts.summary.queryOptions());
  const openAlerts = summary.data?.openAlerts ?? 0;

  return (
    <>
      <div className="flex h-header shrink-0 items-center gap-2 border-b border-hairline px-3.5">
        <span
          aria-hidden="true"
          className="grid size-5.5 shrink-0 place-items-center rounded-sm bg-brand text-[0.6875rem] font-semibold text-brand-foreground"
        >
          ER
        </span>
        <span className="text-[0.8125rem] font-semibold tracking-[-0.01em]">Email Relay</span>
      </div>

      <nav aria-label="主导航" className="flex-1 overflow-y-auto px-2 py-2.5">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <div className="px-2.5 pt-3 pb-1.5 text-[0.625rem] font-medium tracking-[0.09em] text-muted-foreground uppercase first:pt-0">
              {group.label}
            </div>
            <div className="flex flex-col gap-px">
              {group.items.map((item) => {
                const Icon = item.icon;
                const showBadge = "badge" in item && item.badge === "alerts" && openAlerts > 0;

                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={onNavigate}
                    /* activeProps drives aria-current, which the previous native
                       <a> nav lacked entirely - no visual or semantic indication
                       of the current page. */
                    activeProps={{
                      "aria-current": "page",
                      className:
                        "bg-sidebar-accent text-sidebar-accent-foreground font-medium before:absolute before:left-0 before:inset-y-[20%] before:w-0.5 before:rounded-r-sm before:bg-brand [&_svg]:text-brand [&_svg]:opacity-100",
                    }}
                    className="relative flex items-center gap-2 rounded-sm px-2.5 py-1.5 text-[0.8125rem] text-sidebar-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <Icon aria-hidden="true" className="size-3.5 shrink-0 opacity-75" />
                    <span className="min-w-0 truncate">{item.label}</span>
                    {showBadge ? (
                      <span className="ml-auto rounded-sm bg-destructive-muted px-1.5 text-[0.6875rem] font-medium text-destructive tabular-nums">
                        {openAlerts}
                      </span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="shrink-0 border-t border-hairline p-2">
        <div className="flex items-center gap-2 px-2.5 py-1.5 text-xs text-muted-foreground">
          <span
            aria-hidden="true"
            className="size-1.5 shrink-0 rounded-full bg-success ring-2 ring-success-muted"
          />
          <span>管理员会话</span>
        </div>
        <Button
          variant="ghost"
          className="mt-0.5 w-full justify-start"
          onClick={async () => {
            await logoutAdmin();
            navigate({ to: "/login" });
          }}
        >
          <LogOutIcon aria-hidden="true" />
          退出登录
        </Button>
      </div>
    </>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  /* Close on Escape so the mobile drawer is dismissible by keyboard. */
  React.useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  return (
    <div className="min-h-svh md:grid md:grid-cols-[theme(spacing.sidebar)_1fr]">
      {/* Desktop sidebar. The previous shell used a fixed 240px column with no
          breakpoint, so the main area was crushed on small screens. */}
      <aside className="sticky top-0 hidden h-svh flex-col border-r border-border bg-sidebar md:flex">
        <SidebarContent />
      </aside>

      {/* Mobile drawer */}
      {drawerOpen ? (
        <>
          <button
            type="button"
            aria-label="关闭导航"
            className="fixed inset-0 z-40 bg-black/50 md:hidden"
            onClick={() => setDrawerOpen(false)}
          />
          <aside className="fixed inset-y-0 left-0 z-50 flex w-sidebar flex-col border-r border-border bg-sidebar md:hidden">
            <SidebarContent onNavigate={() => setDrawerOpen(false)} />
          </aside>
        </>
      ) : null}

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-header shrink-0 items-center gap-3 border-b border-border bg-background/85 px-4 backdrop-blur-md md:px-5">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label="打开导航"
            aria-expanded={drawerOpen}
            onClick={() => setDrawerOpen(true)}
          >
            {drawerOpen ? <XIcon /> : <MenuIcon />}
          </Button>
          <span className="text-[0.8125rem] font-medium md:hidden">Email Relay</span>
          <div className="ml-auto flex items-center gap-2">
            <ModeToggle />
          </div>
        </header>

        <main className={cn("flex w-full max-w-[1600px] flex-col gap-4 p-4 md:p-5")}>
          {children}
        </main>
      </div>
    </div>
  );
}
