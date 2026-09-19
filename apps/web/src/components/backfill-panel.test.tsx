import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import BackfillPanel from "./backfill-panel";

const MAILBOXES = [
  { id: "mailbox-1", address: "alpha@example.com", provider: "gmail", status: "active" },
  { id: "mailbox-2", address: "beta@example.com", provider: "outlook", status: "auth-expired" },
];

const GROUPS = [
  { id: "group-1", name: "Project Team", kind: "internal" },
  { id: "group-2", name: "VIP", kind: "client" },
];

function renderPanel(overrides: Partial<React.ComponentProps<typeof BackfillPanel>> = {}) {
  const onMailboxBackfill = vi.fn().mockResolvedValue(undefined);
  const onGroupBackfill = vi.fn().mockResolvedValue(undefined);

  render(
    <BackfillPanel
      mailboxes={MAILBOXES}
      groups={GROUPS}
      onMailboxBackfill={onMailboxBackfill}
      onGroupBackfill={onGroupBackfill}
      {...overrides}
    />,
  );

  return { onMailboxBackfill, onGroupBackfill };
}

describe("BackfillPanel", () => {
  /* Replaces the per-row forms: one form plus a target selector, so there is
     exactly one submit button regardless of how many mailboxes exist. */
  it("renders a single backfill form for all mailboxes", () => {
    renderPanel();

    expect(screen.getAllByRole("button", { name: "触发补拉" })).toHaveLength(1);
    expect(screen.getByLabelText("目标邮箱")).toBeInTheDocument();
  });

  it("lists every mailbox as a target option", () => {
    renderPanel();
    const select = screen.getByLabelText("目标邮箱") as HTMLSelectElement;

    expect(select.options).toHaveLength(2);
    expect(select.options[0]?.textContent).toContain("alpha@example.com");
    expect(select.options[1]?.textContent).toContain("beta@example.com");
  });

  it("submits the selected mailbox with the chosen range", async () => {
    const { onMailboxBackfill } = renderPanel();

    fireEvent.change(screen.getByLabelText("目标邮箱"), { target: { value: "mailbox-2" } });
    fireEvent.change(screen.getByLabelText("开始日期"), { target: { value: "2026-04-01" } });
    fireEvent.change(screen.getByLabelText("结束日期"), { target: { value: "2026-04-07" } });
    fireEvent.click(screen.getByRole("button", { name: "触发补拉" }));

    await waitFor(() =>
      expect(onMailboxBackfill).toHaveBeenCalledWith({
        mailboxId: "mailbox-2",
        rangeStart: "2026-04-01",
        rangeEnd: "2026-04-07",
      }),
    );
  });

  it("switches to group targets and submits a group backfill", async () => {
    const { onGroupBackfill, onMailboxBackfill } = renderPanel();

    fireEvent.click(screen.getByRole("tab", { name: "按分组" }));

    const select = screen.getByLabelText("目标分组") as HTMLSelectElement;
    expect(select.options).toHaveLength(2);
    expect(select.options[0]?.textContent).toContain("Project Team");
    expect(select.options[1]?.textContent).toContain("VIP");

    fireEvent.change(select, { target: { value: "group-2" } });
    fireEvent.change(screen.getByLabelText("开始日期"), { target: { value: "2026-04-01" } });
    fireEvent.change(screen.getByLabelText("结束日期"), { target: { value: "2026-04-07" } });
    fireEvent.click(screen.getByRole("button", { name: "触发补拉" }));

    await waitFor(() =>
      expect(onGroupBackfill).toHaveBeenCalledWith({
        groupId: "group-2",
        rangeStart: "2026-04-01",
        rangeEnd: "2026-04-07",
      }),
    );
    expect(onMailboxBackfill).not.toHaveBeenCalled();
  });

  it("shows a per-mode empty message instead of a form", () => {
    renderPanel({ mailboxes: [], groups: [] });

    expect(screen.getByText("目前还没有可补拉的邮箱。")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "触发补拉" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "按分组" }));
    expect(screen.getByText("当前还没有分组。")).toBeInTheDocument();
  });
});
