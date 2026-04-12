import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import ConnectImapForm from "./connect-imap-form";

describe("ConnectImapForm", () => {
  it("submits normalized values when the form is valid", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(<ConnectImapForm onSubmit={onSubmit} isSubmitting={false} />);

    fireEvent.change(screen.getByLabelText("邮箱地址"), {
      target: { value: "admin@example.com" },
    });
    fireEvent.change(screen.getByLabelText("用户名"), {
      target: { value: "admin@example.com" },
    });
    fireEvent.change(screen.getByLabelText("密码 / 应用专用密码"), {
      target: { value: "app-password" },
    });
    fireEvent.change(screen.getByLabelText("手动 Host（可选）"), {
      target: { value: "" },
    });
    fireEvent.change(screen.getByLabelText("手动 Port（可选）"), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByRole("button", { name: "验证并连接 IMAP" }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        email: "admin@example.com",
        username: "admin@example.com",
        password: "app-password",
        host: undefined,
        port: undefined,
        secure: true,
      });
    });
  });

  it("shows required field errors and blocks submission", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(<ConnectImapForm onSubmit={onSubmit} isSubmitting={false} />);

    expect(screen.getByText("请输入有效的邮箱地址")).toBeInTheDocument();
    expect(screen.getByText("请输入用户名")).toBeInTheDocument();
    expect(screen.getByText("请输入密码或应用专用密码")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "验证并连接 IMAP" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "验证并连接 IMAP" }));

    await waitFor(() => {
      expect(onSubmit).not.toHaveBeenCalled();
    });
  });

  it("validates manual host and port", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(<ConnectImapForm onSubmit={onSubmit} isSubmitting={false} />);

    fireEvent.change(screen.getByLabelText("邮箱地址"), {
      target: { value: "admin@example.com" },
    });
    fireEvent.change(screen.getByLabelText("用户名"), {
      target: { value: "admin@example.com" },
    });
    fireEvent.change(screen.getByLabelText("密码 / 应用专用密码"), {
      target: { value: "app-password" },
    });
    fireEvent.change(screen.getByLabelText("手动 Host（可选）"), {
      target: { value: "bad host" },
    });
    fireEvent.change(screen.getByLabelText("手动 Port（可选）"), {
      target: { value: "70000" },
    });

    await waitFor(() => {
      expect(screen.getByText("请输入有效的 IMAP Host")).toBeInTheDocument();
    });
    expect(screen.getByText("端口必须是 1-65535 的整数")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "验证并连接 IMAP" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "验证并连接 IMAP" }));

    expect(onSubmit).not.toHaveBeenCalled();
  });
});
