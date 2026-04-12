import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import AdminPasswordForm from "./admin-password-form";

describe("AdminPasswordForm", () => {
  it("submits only a password and calls the login handler", async () => {
    const onLogin = vi.fn().mockResolvedValue(undefined);
    render(<AdminPasswordForm onLogin={onLogin} isSubmitting={false} error={null} />);

    fireEvent.change(screen.getByLabelText("管理员密码"), {
      target: { value: "a-very-long-admin-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));

    await waitFor(() => {
      expect(onLogin).toHaveBeenCalledWith("a-very-long-admin-password");
    });
  });
});
