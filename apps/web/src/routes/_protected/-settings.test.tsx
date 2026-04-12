import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SettingsPage } from "./settings";
import type { AdminSession } from "@/lib/admin-session";

const getAdminSessionMock = vi.fn<() => Promise<AdminSession | null>>();

vi.mock("@/lib/admin-session", () => ({
  getAdminSession: () => getAdminSessionMock(),
}));

describe("SettingsPage", () => {
  afterEach(() => {
    getAdminSessionMock.mockReset();
  });

  it("shows a loading indicator before the session is resolved", async () => {
    let resolvePromise: ((value: AdminSession | null) => void) | undefined;
    const pendingPromise = new Promise<AdminSession | null>((resolve) => {
      resolvePromise = resolve;
    });

    getAdminSessionMock.mockReturnValueOnce(pendingPromise);

    render(<SettingsPage />);

    expect(screen.getByTestId("session-loading")).toBeInTheDocument();

    await act(async () => {
      resolvePromise?.(null);
      await pendingPromise;
    });

    expect(screen.getByTestId("session-unauthenticated")).toBeInTheDocument();
  });

  it("shows the unauthenticated state when there is no session", async () => {
    getAdminSessionMock.mockResolvedValueOnce(null);

    render(<SettingsPage />);

    expect(await screen.findByTestId("session-unauthenticated")).toBeInTheDocument();
    expect(screen.getByText("请重新登录以继续管理邮箱同步系统。")).toBeInTheDocument();
  });

  it("renders authenticated session details when available", async () => {
    const session: AdminSession = {
      authenticated: true,
      expiresAt: "2026-01-01T12:30:00Z",
    };

    getAdminSessionMock.mockResolvedValueOnce(session);

    render(<SettingsPage />);

    expect(await screen.findByText("认证状态：")).toBeInTheDocument();
    expect(screen.getByText("已认证")).toBeInTheDocument();
    expect(screen.getByLabelText("会话过期时间")).toHaveAttribute("dateTime", session.expiresAt);
    expect(screen.getByText(/本页用于/)).toBeInTheDocument();
  });
});
