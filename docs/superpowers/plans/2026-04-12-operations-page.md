# Sync Operations Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用现有告警汇总、邮箱列表、分组列表和 BackfillForm 组件，把 `/operations` 页面做成可以直接触发 mailbox/group backfill 的运维入口。

**Architecture:** 前端只负责调度已有的 ORPC 查询与 `client.operations` 接口，并将数据和表单拆分成精简、可测试的组件，所有网络状态由 React Query 管理，UI 仍然采用统一边框卡片样式。

**Tech Stack:** React + TanStack React Query + ORPC 客户端 + email-relay UI 组件 + Sonner toast。

---

### Task 1: Build mailbox backfill helper used by `/operations`

**Files:**
- Create: `apps/web/src/components/operations-mailbox-backfill.tsx`
- Test: `apps/web/src/components/operations-mailbox-backfill.test.tsx`

- [ ] **Step 1: Write the failing test**
  ```tsx
  import { render, screen } from "@testing-library/react";
  import { describe, expect, it, vi } from "vitest";

  import OperationsMailboxBackfillSection from "./operations-mailbox-backfill";

  describe("OperationsMailboxBackfillSection", () => {
    it("renders a card per mailbox with a date range", () => {
      render(
        <OperationsMailboxBackfillSection
          mailboxes={[
            { id: "alpha", address: "alpha@example.com", provider: "gmail", status: "active" },
            { id: "beta", address: "beta@example.com", provider: "imap", status: "auth-expired" },
          ]}
          onBackfill={vi.fn(() => Promise.resolve())}
        />,
      );

      expect(screen.getByText("alpha@example.com")).toBeInTheDocument();
      expect(screen.getByText("beta@example.com")).toBeInTheDocument();
      expect(screen.getAllByLabelText("开始日期")).toHaveLength(2);
    });
  });
  ```

- [ ] **Step 2: Run** `pnpm exec vitest run apps/web/src/components/operations-mailbox-backfill.test.tsx` (expect failure since the component does not exist yet).

- [ ] **Step 3: Implement the mailbox backfill section that clusters each mailbox in a `Card`, surfaces provider/status, embeds `BackfillForm`, and tracks per-mailbox submission state.
  ```tsx
  import { Card, CardContent, CardHeader, CardTitle } from "@email-relay/ui/components/card";
  import { useState } from "react";

  import BackfillForm from "@/components/backfill-form";

  type Mailbox = {
    id: string;
    address?: string;
    provider: string;
    status: string;
  };

  export type MailboxBackfillPayload = {
    mailboxId: string;
    rangeStart: string;
    rangeEnd: string;
  };

  export default function OperationsMailboxBackfillSection({
    mailboxes,
    onBackfill,
  }: {
    mailboxes: Mailbox[];
    onBackfill: (payload: MailboxBackfillPayload) => Promise<void>;
  }) {
    const [pending, setPending] = useState<Record<string, boolean>>({});

    const handleSubmit = async (mailboxId: string, value: { rangeStart: string; rangeEnd: string }) => {
      setPending((prev) => ({ ...prev, [mailboxId]: true }));
      try {
        await onBackfill({ mailboxId, ...value });
      } finally {
        setPending((prev) => ({ ...prev, [mailboxId]: false }));
      }
    };

    if (mailboxes.length === 0) {
      return <p className="text-sm text-muted-foreground">目前还没有可补拉的邮箱。</p>;
    }

    return (
      <div className="grid gap-4">
        {mailboxes.map((mailbox) => (
          <Card key={mailbox.id}>
            <CardHeader>
              <CardTitle>{mailbox.address ?? "(未知邮箱)"}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  {mailbox.provider} · {mailbox.status}
                </p>
                <div className="border-t pt-3">
                  <BackfillForm
                    isSubmitting={Boolean(pending[mailbox.id])}
                    onSubmit={(value) => handleSubmit(mailbox.id, value)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }
  ```

- [ ] **Step 4: Run** `pnpm exec vitest run apps/web/src/components/operations-mailbox-backfill.test.tsx` (expect PASS).
- [ ] **Step 5: Stage the changes** `git add apps/web/src/components/operations-mailbox-backfill.tsx apps/web/src/components/operations-mailbox-backfill.test.tsx`.

### Task 2: Build the group backfill section for `/operations`

**Files:**
- Create: `apps/web/src/components/operations-group-backfill.tsx`
- Test: `apps/web/src/components/operations-group-backfill.test.tsx`

- [ ] **Step 1: Write the failing test**
  ```tsx
  import { render, screen } from "@testing-library/react";
  import { describe, expect, it, vi } from "vitest";

  import OperationsGroupBackfillSection from "./operations-group-backfill";

  describe("OperationsGroupBackfillSection", () => {
    it("renders one card per group with the group name", () => {
      render(
        <OperationsGroupBackfillSection
          groups=[
            { id: "g1", name: "Project Team", kind: "project" },
            { id: "g2", name: "VIP", kind: "client" },
          ]
          onBackfill={vi.fn(() => Promise.resolve())}
        />,
      );

      expect(screen.getByText("Project Team")).toBeInTheDocument();
      expect(screen.getByText("VIP")).toBeInTheDocument();
      expect(screen.getAllByLabelText("结束日期")).toHaveLength(2);
    });
  });
  ```

- [ ] **Step 2: Run** `pnpm exec vitest run apps/web/src/components/operations-group-backfill.test.tsx` (expect failure because the component does not exist).

- [ ] **Step 3: Implement the group section with cards + `BackfillForm` and per-group pending tracking.
  ```tsx
  import { Card, CardContent, CardHeader, CardTitle } from "@email-relay/ui/components/card";
  import { useState } from "react";

  import BackfillForm from "@/components/backfill-form";

  type Group = { id: string; name: string; kind: string };

  export type GroupBackfillPayload = { groupId: string; rangeStart: string; rangeEnd: string };

  export default function OperationsGroupBackfillSection({
    groups,
    onBackfill,
  }: {
    groups: Group[];
    onBackfill: (payload: GroupBackfillPayload) => Promise<void>;
  }) {
    const [pending, setPending] = useState<Record<string, boolean>>({});

    const handleSubmit = async (groupId: string, value: { rangeStart: string; rangeEnd: string }) => {
      setPending((prev) => ({ ...prev, [groupId]: true }));
      try {
        await onBackfill({ groupId, ...value });
      } finally {
        setPending((prev) => ({ ...prev, [groupId]: false }));
      }
    };

    if (groups.length === 0) {
      return <p className="text-sm text-muted-foreground">当前还没有分组。</p>;
    }

    return (
      <div className="grid gap-4">
        {groups.map((group) => (
          <Card key={group.id}>
            <CardHeader>
              <CardTitle>{group.name}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">{group.kind}</p>
                <div className="border-t pt-3">
                  <BackfillForm
                    isSubmitting={Boolean(pending[group.id])}
                    onSubmit={(value) => handleSubmit(group.id, value)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }
  ```

- [ ] **Step 4: Run** `pnpm exec vitest run apps/web/src/components/operations-group-backfill.test.tsx` (expect PASS).
- [ ] **Step 5: Stage the component/test files** `git add apps/web/src/components/operations-group-backfill.tsx apps/web/src/components/operations-group-backfill.test.tsx`.

### Task 3: Upgrade `/operations` route to assemble summary + sections

**Files:**
- Modify: `apps/web/src/routes/_protected/operations.tsx`

- [ ] **Step 1: Update the route to pull alerts/mailboxes/groups, reuse `AlertSummaryCards`, import the new sections, and convert the date ranges when hitting `client.operations`. Use toasts for basic user feedback.
  ```tsx
  import { useQuery } from "@tanstack/react-query";
  import { createFileRoute } from "@tanstack/react-router";

  import AlertSummaryCards from "@/components/alert-summary-cards";
  import OperationsGroupBackfillSection, { type GroupBackfillPayload } from "@/components/operations-group-backfill";
  import OperationsMailboxBackfillSection, { type MailboxBackfillPayload } from "@/components/operations-mailbox-backfill";
  import { client, orpc } from "@/utils/orpc";
  import { toast } from "sonner";

  export const Route = createFileRoute("/_protected/operations")({
    component: OperationsPage,
  });

  function OperationsPage() {
    const summary = useQuery(orpc.alerts.summary.queryOptions());
    const mailboxes = useQuery(orpc.mailboxes.list.queryOptions());
    const groups = useQuery(orpc.groups.list.queryOptions());

    const triggerMailboxBackfill = async (payload: MailboxBackfillPayload) => {
      const formatted = {
        rangeStart: new Date(`${payload.rangeStart}T00:00:00.000Z`).toISOString(),
        rangeEnd: new Date(`${payload.rangeEnd}T00:00:00.000Z`).toISOString(),
        mailboxId: payload.mailboxId,
      };
      try {
        await client.operations.triggerMailboxBackfill(formatted);
        toast.success("已排入邮箱补拉任务");
      } catch (error) {
        toast.error(`邮箱补拉失败：${(error as Error).message}`);
        throw error;
      }
    };

    const triggerGroupBackfill = async (payload: GroupBackfillPayload) => {
      const formatted = {
        rangeStart: new Date(`${payload.rangeStart}T00:00:00.000Z`).toISOString(),
        rangeEnd: new Date(`${payload.rangeEnd}T00:00:00.000Z`).toISOString(),
        groupId: payload.groupId,
      };
      try {
        await client.operations.triggerGroupBackfill(formatted);
        toast.success("已排入分组补拉任务");
      } catch (error) {
        toast.error(`分组补拉失败：${(error as Error).message}`);
        throw error;
      }
    };

    return (
      <div className="space-y-6">
        <div className="rounded-xl border p-4 space-y-3">
          <div>
            <h1 className="text-2xl font-semibold">Sync Operations</h1>
            <p className="text-sm text-muted-foreground">
              这里汇总所有告警并在一个地方提供 mailbox/group 粒度的历史补拉入口。
            </p>
          </div>
          {summary.data ? (
            <AlertSummaryCards summary={summary.data} />
          ) : (
            <p className="text-sm text-muted-foreground">告警概览加载中...</p>
          )}
        </div>

        <section className="rounded-xl border p-4 space-y-3">
          <div>
            <h2 className="text-xl font-semibold">按邮箱补拉</h2>
            <p className="text-sm text-muted-foreground">
              直接选择单个邮箱，调整时间区间即可为该邮箱重跑历史同步。
            </p>
          </div>
          {mailboxes.isLoading ? (
            <p className="text-sm text-muted-foreground">邮箱列表加载中...</p>
          ) : (
            <OperationsMailboxBackfillSection
              mailboxes={mailboxes.data ?? []}
              onBackfill={triggerMailboxBackfill}
            />
          )}
        </section>

        <section className="rounded-xl border p-4 space-y-3">
          <div>
            <h2 className="text-xl font-semibold">按分组补拉</h2>
            <p className="text-sm text-muted-foreground">
              复用已有分组，批量触发多个邮箱的历史补拉。
            </p>
          </div>
          {groups.isLoading ? (
            <p className="text-sm text-muted-foreground">分组列表加载中...</p>
          ) : (
            <OperationsGroupBackfillSection
              groups={groups.data ?? []}
              onBackfill={triggerGroupBackfill}
            />
          )}
        </section>
      </div>
    );
  }
  ```

- [ ] **Step 2: Run** `pnpm exec vitest run apps/web/src/components/operations-mailbox-backfill.test.tsx apps/web/src/components/operations-group-backfill.test.tsx` to ensure the helper tests still pass when the page imports them.
- [ ] **Step 3: Stage the operations route update** `git add apps/web/src/routes/_protected/operations.tsx`.

### Task 4: Commit all files

- [ ] **Step 1: Commit** `git commit -m "feat: build operations page backfill" apps/web/src/components/operations-mailbox-backfill.tsx apps/web/src/components/operations-mailbox-backfill.test.tsx apps/web/src/components/operations-group-backfill.tsx apps/web/src/components/operations-group-backfill.test.tsx apps/web/src/routes/_protected/operations.tsx`.
