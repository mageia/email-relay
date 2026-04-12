import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import InboxSidebar from "./inbox-sidebar";

describe("InboxSidebar", () => {
  it("reports provider, mailbox, group and status filter changes", () => {
    const onChange = vi.fn();

    render(
      <InboxSidebar
        groups={[{ id: "group-1", name: "客户 A" }]}
        mailboxes={[
          { id: "mailbox-1", address: "alpha@example.com", provider: "gmail", status: "active" },
          { id: "mailbox-2", address: "beta@example.com", provider: "imap", status: "paused" },
        ]}
        value={{ provider: undefined, groupId: undefined, mailboxId: undefined, status: undefined }}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "GMAIL" }));
    fireEvent.click(screen.getByRole("button", { name: "客户 A" }));
    fireEvent.click(screen.getByRole("button", { name: "alpha@example.com" }));
    fireEvent.click(screen.getByRole("button", { name: "ACTIVE" }));

    expect(onChange).toHaveBeenNthCalledWith(1, { provider: "gmail" });
    expect(onChange).toHaveBeenNthCalledWith(2, { groupId: "group-1" });
    expect(onChange).toHaveBeenNthCalledWith(3, { mailboxId: "mailbox-1" });
    expect(onChange).toHaveBeenNthCalledWith(4, { status: "active" });
  });
});
