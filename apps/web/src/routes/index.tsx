import { createFileRoute, redirect } from "@tanstack/react-router";

import { getAdminSession } from "@/lib/admin-session";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    const session = await getAdminSession();
    throw redirect({ to: session ? "/inbox" : "/login" });
  },
  component: () => null,
});
