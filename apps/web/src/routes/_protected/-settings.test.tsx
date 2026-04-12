import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SettingsPage } from "./settings";

const getAdminSessionMock = vi.fn();

vi.mock("@/lib/admin-session", () => ({
  getAdminSession: () => getAdminSessionMock(),
}));

describe("SettingsPage", () => {
  beforeEach(() => {
    getAdminSessionMock.mockReset();
  });

  it("shows a loading state before the session request resolves", () => {
    getAdminSessionMock.mockReturnValue(new Promise(() => undefined));

    render(<SettingsPage />);

    expect(screen.getByText("管理员会话加载中...")).toBeInTheDocument();
  });

  it("renders authenticated session details", async () => {
    getAdminSessionMock.mockResolvedValue({
      authenticated: true,
      expiresAt: "2026-04-13T08:00:00.000Z",
    });

    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText("已认证")).toBeInTheDocument();
    });
    expect(screen.getByText(/2026/)).toBeInTheDocument();
    expect(screen.getByText("这里用于查看当前管理员会话与控制面状态。") ).toBeInTheDocument();
  });

  it("renders an explicit unauthenticated state", async () => {
    getAdminSessionMock.mockResolvedValue(null);

    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText("未检测到管理员会话")).toBeInTheDocument();
    });
    expect(screen.getByText("请重新登录以继续管理邮箱同步系统。" )).toBeInTheDocument();
  });
});
