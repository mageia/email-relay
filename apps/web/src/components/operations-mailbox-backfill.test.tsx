import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import OperationsMailboxBackfillSection from "./operations-mailbox-backfill";

describe("OperationsMailboxBackfillSection", () => {
  it("renders a card per mailbox with a date range", () => {
    render(
      <OperationsMailboxBackfillSection
        mailboxes={
          [
            { id: "alpha", address: "alpha@example.com", provider: "gmail", status: "active" },
            { id: "beta", address: "beta@example.com", provider: "imap", status: "auth-expired" },
          ]
        }
        onBackfill={vi.fn(() => Promise.resolve())}
      />,
    );

    expect(screen.getByText("alpha@example.com")).toBeInTheDocument();
    expect(screen.getByText("beta@example.com")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "触发补拉" })).toHaveLength(2);
  });
});
