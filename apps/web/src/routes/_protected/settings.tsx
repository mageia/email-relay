import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_protected/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <div className="rounded-xl border p-4">
      <h1 className="mb-2 text-2xl font-semibold">设置</h1>
      <p className="text-sm text-muted-foreground">
        本阶段只展示控制面骨架。密码轮换、保留策略和更细粒度设置在后续计划中实现。
      </p>
    </div>
  );
}
