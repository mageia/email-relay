import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import AdminPasswordForm from "@/components/admin-password-form";
import { loginAdmin } from "@/lib/admin-session";

export const Route = createFileRoute("/login")({
  component: RouteComponent,
});

function RouteComponent() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  return (
    <AdminPasswordForm
      error={error}
      isSubmitting={isSubmitting}
      onLogin={async (password) => {
        setIsSubmitting(true);
        setError(null);
        try {
          await loginAdmin(password);
          navigate({ to: "/inbox" });
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : "登录失败");
        } finally {
          setIsSubmitting(false);
        }
      }}
    />
  );
}
