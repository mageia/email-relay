import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { getAdminSession, type AdminSession } from "@/lib/admin-session";

type SessionState =
  | { status: "loading" }
  | { status: "ready"; session: AdminSession | null };

export const Route = createFileRoute("/_protected/settings")({
  component: SettingsPage,
});

export function SettingsPage() {
  const [state, setState] = useState<SessionState>({ status: "loading" });

  useEffect(() => {
    let isActive = true;

    void getAdminSession().then((session) => {
      if (!isActive) {
        return;
      }

      setState({
        status: "ready",
        session,
      });
    });

    return () => {
      isActive = false;
    };
  }, []);

  return (
    <div className="rounded-xl border p-4 space-y-4">
      <div>
        <h1 className="mb-2 text-2xl font-semibold">设置</h1>
        <p className="text-sm text-muted-foreground">本页用于查看当前管理员会话与控制面状态。</p>
      </div>

      {state.status === "loading" ? (
        <p className="text-sm text-muted-foreground" data-testid="session-loading">
          管理员会话加载中...
        </p>
      ) : state.session ? (
        <div className="space-y-2 text-sm" data-testid="session-authenticated">
          <div>
            <span className="font-medium">认证状态：</span>
            <span>已认证</span>
          </div>
          <div>
            <span className="font-medium">会话过期时间：</span>
            <time
              aria-label="会话过期时间"
              dateTime={state.session.expiresAt}
            >
              {new Date(state.session.expiresAt).toLocaleString("zh-CN", { hour12: false })}
            </time>
          </div>
        </div>
      ) : (
        <div className="space-y-2 text-sm text-muted-foreground" data-testid="session-unauthenticated">
          <p>未检测到管理员会话</p>
          <p>请重新登录以继续管理邮箱同步系统。</p>
        </div>
      )}
    </div>
  );
}
