import { Badge } from "@email-relay/ui/components/badge";
import PageHeader from "@email-relay/ui/components/page-header";
import {
  Panel,
  PanelBody,
  PanelHeader,
  PanelTitle,
} from "@email-relay/ui/components/panel";
import { Skeleton } from "@email-relay/ui/components/skeleton";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { ModeToggle } from "@/components/mode-toggle";
import { type AdminSession, getAdminSession } from "@/lib/admin-session";

type SessionState = { status: "loading" } | { status: "ready"; session: AdminSession | null };

export const Route = createFileRoute("/_protected/settings")({
  component: SettingsPage,
});

/* Exported for direct import by the settings test. */
export function SettingsPage() {
  const [state, setState] = useState<SessionState>({ status: "loading" });

  useEffect(() => {
    let isActive = true;

    void getAdminSession().then((session) => {
      if (!isActive) {
        return;
      }

      setState({ status: "ready", session });
    });

    return () => {
      isActive = false;
    };
  }, []);

  return (
    <>
      <PageHeader
        title="设置"
        description="本页用于查看当前管理员会话与控制面状态。"
      />

      <Panel className="max-w-2xl">
        <PanelHeader>
          <PanelTitle>管理员会话</PanelTitle>
        </PanelHeader>
        <PanelBody>
          {state.status === "loading" ? (
            <div data-testid="session-loading" className="flex flex-col gap-2">
              <span className="sr-only">管理员会话加载中...</span>
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-4 w-64" />
            </div>
          ) : state.session ? (
            <dl
              data-testid="session-authenticated"
              className="grid grid-cols-[6.5rem_1fr] gap-x-3.5 gap-y-2.5 text-[0.8125rem]"
            >
              {/* The full-width colon is part of the string the test asserts, so
                  it stays inside this element rather than moving to CSS. */}
              <dt className="text-muted-foreground">
                <span className="font-medium">认证状态：</span>
              </dt>
              <dd>
                <Badge tone="success" dot>
                  <span>已认证</span>
                </Badge>
              </dd>
              <dt className="text-muted-foreground">
                <span className="font-medium">会话过期时间：</span>
              </dt>
              <dd>
                <time
                  aria-label="会话过期时间"
                  dateTime={state.session.expiresAt}
                  className="font-mono text-xs"
                >
                  {new Date(state.session.expiresAt).toLocaleString("zh-CN", { hour12: false })}
                </time>
              </dd>
            </dl>
          ) : (
            <div
              data-testid="session-unauthenticated"
              className="flex flex-col gap-1.5 text-[0.8125rem] text-muted-foreground"
            >
              <p>未检测到管理员会话</p>
              <p>请重新登录以继续管理邮箱同步系统。</p>
            </div>
          )}
        </PanelBody>
      </Panel>

      <Panel className="max-w-2xl">
        <PanelHeader>
          <PanelTitle>外观</PanelTitle>
        </PanelHeader>
        <PanelBody className="flex items-center gap-3">
          <div className="min-w-0">
            <div className="text-[0.8125rem] font-medium">主题</div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              在浅色、深色与跟随系统之间切换。
            </p>
          </div>
          <div className="ml-auto">
            <ModeToggle />
          </div>
        </PanelBody>
      </Panel>
    </>
  );
}
