import { Button } from "@email-relay/ui/components/button";
import { useNavigate } from "@tanstack/react-router";

import { logoutAdmin } from "@/lib/admin-session";

const NAV_ITEMS = [
  { href: "/inbox", label: "Inbox" },
  { href: "/alerts", label: "Alerts" },
  { href: "/groups", label: "Groups" },
  { href: "/mailboxes", label: "Mailboxes" },
  { href: "/operations", label: "Operations" },
  { href: "/settings", label: "Settings" },
] as const;

export default function AppShell({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();

  return (
    <div className="grid min-h-svh grid-cols-[240px_1fr]">
      <aside className="border-r px-4 py-6">
        <div className="mb-6 text-lg font-semibold">Email Relay Admin</div>
        <nav className="grid gap-2">
          {NAV_ITEMS.map((item) => (
            <a key={item.href} href={item.href} className="rounded-md px-3 py-2 text-sm hover:bg-muted">
              {item.label}
            </a>
          ))}
        </nav>
        <Button
          variant="outline"
          className="mt-6 w-full"
          onClick={async () => {
            await logoutAdmin();
            navigate({ to: "/login" });
          }}
        >
          退出登录
        </Button>
      </aside>
      <main className="min-w-0 bg-background px-6 py-6">{children}</main>
    </div>
  );
}
