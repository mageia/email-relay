import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

import AppShell from "@/components/app-shell";
import { getAdminSession } from "@/lib/admin-session";

export const Route = createFileRoute("/_protected")({
  beforeLoad: async () => {
    const session = await getAdminSession();
    if (!session) {
      throw redirect({ to: "/login" });
    }

    return { session };
  },
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
